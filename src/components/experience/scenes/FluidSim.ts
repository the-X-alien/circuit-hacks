import * as THREE from 'three';
import { FXScene, fullscreenTriangle, type UpdateArgs } from '../FXSceneManager';

// ── GPU stable-fluids solver (grid-based Navier-Stokes) ─────────────
// Ping-pong half-float FBOs: advect → splat → divergence → pressure
// Jacobi → gradient subtract. Dye field rendered as the visible layer.

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const ADVECTION = /* glsl */ `
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  uniform float uDt;
  uniform float uDissipation;
  varying vec2 vUv;
  void main() {
    vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexel;
    gl_FragColor = uDissipation * texture2D(uSource, coord);
    gl_FragColor.a = 1.0;
  }
`;

const SPLAT = /* glsl */ `
  uniform sampler2D uTarget;
  uniform float uAspect;
  uniform vec3 uColor;
  uniform vec2 uPoint;
  uniform float uRadius;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - uPoint;
    p.x *= uAspect;
    vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + splat, 1.0);
  }
`;

const DIVERGENCE = /* glsl */ `
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float L = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
    float T = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
    gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
  }
`;

const CLEAR = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uValue;
  varying vec2 vUv;
  void main() {
    gl_FragColor = uValue * texture2D(uTexture, vUv);
  }
`;

const PRESSURE = /* glsl */ `
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    float div = texture2D(uDivergence, vUv).x;
    gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
  }
`;

const GRADIENT = /* glsl */ `
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    vec2 vel = texture2D(uVelocity, vUv).xy;
    vel -= vec2(R - L, T - B) * 0.5;
    gl_FragColor = vec4(vel, 0.0, 1.0);
  }
`;

const DISPLAY = /* glsl */ `
  uniform sampler2D uTexture;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(uTexture, vUv).rgb;
    c += vec3(0.012, 0.010, 0.024); // faint ambient floor
    gl_FragColor = vec4(c, 1.0);
  }
`;

interface DoubleFBO {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;
  texel: THREE.Vector2;
  swap(): void;
}

function createDoubleFBO(w: number, h: number): DoubleFBO {
  const opts: THREE.RenderTargetOptions = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  };
  const fbo = {
    read: new THREE.WebGLRenderTarget(w, h, opts),
    write: new THREE.WebGLRenderTarget(w, h, opts),
    texel: new THREE.Vector2(1 / w, 1 / h),
    swap() {
      const t = fbo.read;
      fbo.read = fbo.write;
      fbo.write = t;
    },
  };
  return fbo;
}

export class FluidSim extends FXScene {
  private simScene = new THREE.Scene();
  private simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad!: THREE.Mesh;

  private velocity!: DoubleFBO;
  private dye!: DoubleFBO;
  private pressure!: DoubleFBO;
  private divergence!: THREE.WebGLRenderTarget;

  private mats!: Record<string, THREE.ShaderMaterial>;
  private renderer!: THREE.WebGLRenderer;

  private aspect = 1;
  private lastPointer: { x: number; y: number } | null = null;
  private idleTimer = 0;
  private hue = Math.random();
  private dt16 = 0.016;

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);
    this.renderer = renderer;

    this.quad = new THREE.Mesh(fullscreenTriangle());
    this.quad.frustumCulled = false;
    this.simScene.add(this.quad);

    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: frag,
        uniforms,
        depthTest: false,
        depthWrite: false,
      });

    this.mats = {
      advection: mk(ADVECTION, {
        uVelocity: { value: null },
        uSource: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uDt: { value: 0.016 },
        uDissipation: { value: 1 },
      }),
      splat: mk(SPLAT, {
        uTarget: { value: null },
        uAspect: { value: 1 },
        uColor: { value: new THREE.Vector3() },
        uPoint: { value: new THREE.Vector2() },
        uRadius: { value: 0.0022 },
      }),
      divergence: mk(DIVERGENCE, {
        uVelocity: { value: null },
        uTexel: { value: new THREE.Vector2() },
      }),
      clear: mk(CLEAR, { uTexture: { value: null }, uValue: { value: 0.8 } }),
      pressure: mk(PRESSURE, {
        uPressure: { value: null },
        uDivergence: { value: null },
        uTexel: { value: new THREE.Vector2() },
      }),
      gradient: mk(GRADIENT, {
        uPressure: { value: null },
        uVelocity: { value: null },
        uTexel: { value: new THREE.Vector2() },
      }),
      display: mk(DISPLAY, { uTexture: { value: null } }),
    };

    this.allocate();
  }

  private allocate(): void {
    const canvas = this.renderer.domElement;
    this.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const simRes = 144;
    const dyeRes = 512;
    const dims = (res: number) =>
      this.aspect >= 1
        ? { w: Math.round(res * this.aspect), h: res }
        : { w: res, h: Math.round(res / this.aspect) };

    const sv = dims(simRes);
    const sd = dims(dyeRes);
    this.velocity?.read.dispose();
    this.velocity?.write.dispose();
    this.dye?.read.dispose();
    this.dye?.write.dispose();
    this.pressure?.read.dispose();
    this.pressure?.write.dispose();
    this.divergence?.dispose();

    this.velocity = createDoubleFBO(sv.w, sv.h);
    this.pressure = createDoubleFBO(sv.w, sv.h);
    this.dye = createDoubleFBO(sd.w, sd.h);
    this.divergence = new THREE.WebGLRenderTarget(sv.w, sv.h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
    });
  }

  override resize(w: number, h: number): void {
    super.resize(w, h);
    if (this.renderer) this.allocate();
  }

  private blit(target: THREE.WebGLRenderTarget | null, material: THREE.ShaderMaterial): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.simScene, this.simCamera);
  }

  private splat(x: number, y: number, dx: number, dy: number, color: THREE.Vector3): void {
    const m = this.mats.splat!;
    m.uniforms.uAspect.value = this.aspect;
    m.uniforms.uPoint.value.set(x, y);

    m.uniforms.uTarget.value = this.velocity.read.texture;
    m.uniforms.uColor.value.set(dx, dy, 0);
    m.uniforms.uRadius.value = 0.0032;
    this.blit(this.velocity.write, m);
    this.velocity.swap();

    m.uniforms.uTarget.value = this.dye.read.texture;
    m.uniforms.uColor.value.copy(color);
    m.uniforms.uRadius.value = 0.0022;
    this.blit(this.dye.write, m);
    this.dye.swap();
  }

  private dyeColor(strength: number): THREE.Vector3 {
    this.hue = (this.hue + 0.13) % 1;
    const c = new THREE.Color().setHSL(0.5 + this.hue * 0.35, 0.95, 0.5);
    return new THREE.Vector3(c.r, c.g, c.b).multiplyScalar(strength);
  }

  private step(dt: number, pointer: { nx: number; ny: number }): void {
    const px = pointer.nx * 0.5 + 0.5;
    const py = pointer.ny * 0.5 + 0.5;

    // Pointer-driven splats
    if (this.lastPointer) {
      const dx = px - this.lastPointer.x;
      const dy = py - this.lastPointer.y;
      const speed = Math.hypot(dx, dy);
      if (speed > 0.0004) {
        this.splat(px, py, dx * 5500, dy * 5500, this.dyeColor(Math.min(speed * 22, 0.5)));
        this.idleTimer = 0;
      }
    }
    this.lastPointer = { x: px, y: py };

    // Ambient splats keep the field alive when idle
    this.idleTimer += dt;
    if (this.idleTimer > 1.1) {
      this.idleTimer = 0;
      const x = 0.2 + Math.random() * 0.6;
      const y = 0.15 + Math.random() * 0.5;
      const a = Math.random() * Math.PI * 2;
      const f = 220 + Math.random() * 500;
      this.splat(x, y, Math.cos(a) * f, Math.sin(a) * f, this.dyeColor(0.3));
    }

    const adv = this.mats.advection!;
    adv.uniforms.uDt.value = dt;

    // Advect velocity
    adv.uniforms.uTexel.value.copy(this.velocity.texel);
    adv.uniforms.uVelocity.value = this.velocity.read.texture;
    adv.uniforms.uSource.value = this.velocity.read.texture;
    adv.uniforms.uDissipation.value = 1 / (1 + dt * 0.22);
    this.blit(this.velocity.write, adv);
    this.velocity.swap();

    // Advect dye
    adv.uniforms.uTexel.value.copy(this.velocity.texel);
    adv.uniforms.uVelocity.value = this.velocity.read.texture;
    adv.uniforms.uSource.value = this.dye.read.texture;
    adv.uniforms.uDissipation.value = 1 / (1 + dt * 0.55);
    this.blit(this.dye.write, adv);
    this.dye.swap();

    // Projection: divergence → pressure Jacobi → subtract gradient
    const div = this.mats.divergence!;
    div.uniforms.uTexel.value.copy(this.velocity.texel);
    div.uniforms.uVelocity.value = this.velocity.read.texture;
    this.blit(this.divergence, div);

    const clear = this.mats.clear!;
    clear.uniforms.uTexture.value = this.pressure.read.texture;
    this.blit(this.pressure.write, clear);
    this.pressure.swap();

    const pr = this.mats.pressure!;
    pr.uniforms.uTexel.value.copy(this.velocity.texel);
    pr.uniforms.uDivergence.value = this.divergence.texture;
    for (let i = 0; i < 18; i++) {
      pr.uniforms.uPressure.value = this.pressure.read.texture;
      this.blit(this.pressure.write, pr);
      this.pressure.swap();
    }

    const grad = this.mats.gradient!;
    grad.uniforms.uTexel.value.copy(this.velocity.texel);
    grad.uniforms.uPressure.value = this.pressure.read.texture;
    grad.uniforms.uVelocity.value = this.velocity.read.texture;
    this.blit(this.velocity.write, grad);
    this.velocity.swap();
  }

  override update({ dt, pointer }: UpdateArgs): void {
    this.dt16 = Math.min(dt, 0.033);
    this.step(this.dt16, pointer);
  }

  override render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
    const disp = this.mats.display!;
    disp.uniforms.uTexture.value = this.dye.read.texture;
    this.blit(target, disp);
  }
}
