import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';
import vert from '../shaders/metal.vert.glsl';
import frag from '../shaders/metal.frag.glsl';

/** Procedural chrome matcap — dark studio with cyan/violet key lights. */
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

  light(size * 0.32, size * 0.24, size * 0.38, '#e8fbff', 0.95); // key
  light(size * 0.3, size * 0.22, size * 0.12, '#ffffff', 1);     // hotspot
  light(size * 0.78, size * 0.72, size * 0.4, '#8b5bff', 0.5);   // violet fill
  light(size * 0.72, size * 0.3, size * 0.25, '#4fe3ff', 0.4);   // cyan rim
  light(size * 0.5, size * 0.9, size * 0.35, '#1a2c4f', 0.6);    // floor bounce

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Reactive liquid-chrome blob: noise-displaced sphere with a spring
 * system that leans toward the cursor and gets agitated by movement.
 */
export class LiquidMetal extends FXScene {
  private material!: THREE.ShaderMaterial;
  private mesh!: THREE.Mesh;
  private ring!: THREE.Points;

  private springPos = new THREE.Vector2();
  private springVel = new THREE.Vector2();
  private excite = 0;
  private lastPointer = new THREE.Vector2();

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);

    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 0.16 },
        uRadius: { value: 1.55 },
        uMatcap: { value: makeMatcap() },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, lite ? 32 : 64), this.material);
    this.scene.add(this.mesh);

    // Orbiting particle halo
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
        color: 0x4fe3ff,
        size: 0.03,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.scene.add(this.ring);

    this.camera.position.set(0, 0, 5.4);
  }

  override update({ t, dt, pointer }: UpdateArgs): void {
    const clampedDt = Math.min(dt, 0.05);

    // Spring toward pointer
    const target = new THREE.Vector2(pointer.nx * 0.9, pointer.ny * 0.6);
    const k = 26;
    const damp = Math.pow(0.0025, clampedDt); // frame-rate independent damping
    this.springVel.x += (target.x - this.springPos.x) * k * clampedDt;
    this.springVel.y += (target.y - this.springPos.y) * k * clampedDt;
    this.springVel.multiplyScalar(damp);
    this.springPos.addScaledVector(this.springVel, clampedDt * 8);

    // Agitation from pointer speed
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
  }
}
