import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';

function makeMatcap(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const base = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.55);
  base.addColorStop(0, '#3a3a46');
  base.addColorStop(0.62, '#16161d');
  base.addColorStop(1, '#050507');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const light = (x: number, y: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;
  };

  light(size * 0.32, size * 0.24, size * 0.38, '#e8fbff', 0.95);
  light(size * 0.3, size * 0.22, size * 0.12, '#ffffff', 1);
  light(size * 0.78, size * 0.72, size * 0.4, '#bd8550', 0.5);
  light(size * 0.72, size * 0.3, size * 0.25, '#e6b54a', 0.4);
  light(size * 0.5, size * 0.9, size * 0.35, '#1a2c4f', 0.6);
  light(size * 0.22, size * 0.78, size * 0.2, '#6fa8d6', 0.3);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class LiquidMetal extends FXScene {
  private material!: THREE.ShaderMaterial;
  private mesh!: THREE.Mesh;
  private ring!: THREE.Points;
  private innerRing!: THREE.Points;

  private springPos = new THREE.Vector2();
  private springVel = new THREE.Vector2();
  private excite = 0;
  private lastPointer = new THREE.Vector2();

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);

    this.material = new THREE.ShaderMaterial({
      vertexShader: `
        uniform float uTime;
        uniform float uAmp;
        uniform float uRadius;

        varying vec3 vNormalV;
        varying vec3 vViewDir;
        varying float vDisp;
        varying float vNoise2;

        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ * ns.x + ns.yyyy;
          vec4 y = y_ * ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0) * 2.0 + 1.0;
          vec4 s1 = floor(b1) * 2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
        }

        float displaceAmt(vec3 dir) {
          float n = snoise(dir * 1.7 + vec3(0.0, uTime * 0.22, uTime * 0.08));
          n += 0.45 * snoise(dir * 3.6 - vec3(uTime * 0.15));
          return n * uAmp;
        }

        vec3 displaced(vec3 dir) {
          return dir * (uRadius + displaceAmt(dir));
        }

        void main() {
          vec3 dir = normalize(position);
          vec3 p = displaced(dir);

          vec3 t = normalize(cross(dir, vec3(0.0, 1.0, 0.001)));
          vec3 b = normalize(cross(dir, t));
          float e = 0.03;
          vec3 p1 = displaced(normalize(dir + t * e));
          vec3 p2 = displaced(normalize(dir + b * e));
          vec3 n = normalize(cross(p1 - p, p2 - p));

          vNormalV = normalize(normalMatrix * n);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vViewDir = normalize(-mv.xyz);
          vDisp = length(p) - uRadius;

          // Secondary noise for dispersion
          vNoise2 = snoise(dir * 2.8 + uTime * 0.12);

          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMatcap;
        uniform float uTime;

        varying vec3 vNormalV;
        varying vec3 vViewDir;
        varying float vDisp;
        varying float vNoise2;

        void main() {
          vec3 n = normalize(vNormalV);
          vec2 muv = clamp(n.xy * 0.485 + 0.5, 0.0, 1.0);
          vec3 col = texture2D(uMatcap, muv).rgb;

          float fres = pow(1.0 - max(dot(n, normalize(vViewDir)), 0.0), 3.0);
          col += vec3(0.95, 0.75, 0.35) * fres * 0.65;

          float dispGlow = smoothstep(0.04, 0.28, vDisp);
          col += vec3(0.74, 0.52, 0.30) * dispGlow * 0.30;

          // Chromatic surface shimmer
          float shimmer = 0.5 + 0.5 * sin(vNoise2 * 6.0 + uTime * 2.0);
          col += vec3(0.44, 0.66, 0.84) * shimmer * 0.08;

          // Hot emissive veins on high displacement
          float veins = smoothstep(0.12, 0.25, abs(vDisp));
          col += vec3(0.96, 0.77, 0.38) * veins * 0.12 * (0.5 + 0.5 * sin(vNoise2 * 10.0 + uTime * 3.0));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 0.16 },
        uRadius: { value: 1.55 },
        uMatcap: { value: makeMatcap() },
      },
    });
    this.mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, lite ? 32 : 64),
      this.material
    );
    this.scene.add(this.mesh);

    // Outer particle halo
    const n = lite ? 250 : 700;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2.6 + Math.random() * 3.4;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 2.4;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.ring = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xbd8550,
        size: 0.03,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.scene.add(this.ring);

    // Inner tight particle ring
    const innerCount = lite ? 60 : 160;
    const innerGeo = new THREE.BufferGeometry();
    const iPos = new Float32Array(innerCount * 3);
    for (let i = 0; i < innerCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.8 + Math.random() * 0.6;
      iPos[i * 3] = Math.cos(a) * r;
      iPos[i * 3 + 1] = (Math.random() - 0.5) * 1.2;
      iPos[i * 3 + 2] = Math.sin(a) * r;
    }
    innerGeo.setAttribute('position', new THREE.BufferAttribute(iPos, 3));
    this.innerRing = new THREE.Points(
      innerGeo,
      new THREE.PointsMaterial({
        color: 0xe6b54a,
        size: 0.06,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.scene.add(this.innerRing);

    this.camera.position.set(0, 0, 5.4);
  }

  override update({ t, dt, pointer }: UpdateArgs): void {
    const clampedDt = Math.min(dt, 0.05);

    const target = new THREE.Vector2(pointer.nx * 0.9, pointer.ny * 0.6);
    const k = 26;
    const damp = Math.pow(0.0025, clampedDt);
    this.springVel.x += (target.x - this.springPos.x) * k * clampedDt;
    this.springVel.y += (target.y - this.springPos.y) * k * clampedDt;
    this.springVel.multiplyScalar(damp);
    this.springPos.addScaledVector(this.springVel, clampedDt * 8);

    const speed = this.lastPointer.distanceTo(target);
    this.lastPointer.copy(target);
    this.excite += (Math.min(speed * 8, 1) - this.excite) * Math.min(1, clampedDt * 4);

    this.material.uniforms.uTime.value = t;
    this.material.uniforms.uAmp.value = 0.14 + this.excite * 0.34;

    this.mesh.position.set(this.springPos.x, this.springPos.y, 0);
    this.mesh.rotation.y = t * 0.15 + this.springPos.x * 0.4;
    this.mesh.rotation.x = this.springPos.y * -0.35;

    this.ring.rotation.y = t * 0.06;
    this.ring.rotation.z = Math.sin(t * 0.1) * 0.1;
    this.innerRing.rotation.y = -t * 0.09 + Math.sin(t * 0.05) * 0.2;
    this.innerRing.rotation.x = Math.sin(t * 0.07) * 0.08;
  }
}
