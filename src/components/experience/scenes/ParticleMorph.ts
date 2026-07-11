import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';
import vert from '../shaders/particles.vert.glsl';
import frag from '../shaders/particles.frag.glsl';

/**
 * Generates target points shaped like a microchip glyph: die, pads,
 * pins and radiating circuit traces. All procedural — no assets.
 */
function chipPoints(count: number): Float32Array {
  const pts = new Float32Array(count * 3);
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const HALF = 3;

  const onSegment = (i: number, ax: number, ay: number, bx: number, by: number) => {
    const t = Math.random();
    pts[i * 3] = ax + (bx - ax) * t + rand(-0.02, 0.02);
    pts[i * 3 + 1] = ay + (by - ay) * t + rand(-0.02, 0.02);
    pts[i * 3 + 2] = rand(-0.12, 0.12);
  };

  let i = 0;
  const take = (frac: number) => Math.floor(count * frac);

  // Body outline (square perimeter)
  for (const end = i + take(0.2); i < end; i++) {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) onSegment(i, -HALF, HALF, HALF, HALF);
    else if (side === 1) onSegment(i, HALF, HALF, HALF, -HALF);
    else if (side === 2) onSegment(i, HALF, -HALF, -HALF, -HALF);
    else onSegment(i, -HALF, -HALF, -HALF, HALF);
  }

  // Inner die outline
  const DIE = 1.3;
  for (const end = i + take(0.1); i < end; i++) {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) onSegment(i, -DIE, DIE, DIE, DIE);
    else if (side === 1) onSegment(i, DIE, DIE, DIE, -DIE);
    else if (side === 2) onSegment(i, DIE, -DIE, -DIE, -DIE);
    else onSegment(i, -DIE, -DIE, -DIE, DIE);
  }

  // Pad grid between die and body
  const padCoords: [number, number][] = [];
  for (let px = -2.2; px <= 2.2; px += 1.1) {
    for (let py = -2.2; py <= 2.2; py += 1.1) {
      if (Math.abs(px) < DIE + 0.3 && Math.abs(py) < DIE + 0.3) continue;
      padCoords.push([px, py]);
    }
  }
  for (const end = i + take(0.15); i < end; i++) {
    const [px, py] = padCoords[Math.floor(Math.random() * padCoords.length)]!;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.22;
    pts[i * 3] = px + Math.cos(a) * r;
    pts[i * 3 + 1] = py + Math.sin(a) * r;
    pts[i * 3 + 2] = rand(-0.1, 0.1);
  }

  // Pins: short stubs leaving each side
  const PINS = 7;
  const pinEnds: [number, number, number, number][] = [];
  for (let s = 0; s < 4; s++) {
    for (let k = 0; k < PINS; k++) {
      const off = -HALF + 0.6 + (k * (HALF * 2 - 1.2)) / (PINS - 1);
      if (s === 0) pinEnds.push([off, HALF, off, HALF + 1.4]);
      else if (s === 1) pinEnds.push([off, -HALF, off, -HALF - 1.4]);
      else if (s === 2) pinEnds.push([HALF, off, HALF + 1.4, off]);
      else pinEnds.push([-HALF, off, -HALF - 1.4, off]);
    }
  }
  for (const end = i + take(0.2); i < end; i++) {
    const [ax, ay, bx, by] = pinEnds[Math.floor(Math.random() * pinEnds.length)]!;
    onSegment(i, ax, ay, bx, by);
  }

  // Traces: elbow lines continuing from pin tips outward
  const traces: [number, number, number, number][] = [];
  for (const [, , bx, by] of pinEnds) {
    const horizontal = Math.abs(bx) > Math.abs(by);
    const len = rand(1.2, 3.4);
    const ex = horizontal ? bx + Math.sign(bx) * len : bx;
    const ey = horizontal ? by : by + Math.sign(by) * len;
    traces.push([bx, by, ex, ey]);
    // elbow bend
    const bend = rand(0.8, 2.2) * (Math.random() > 0.5 ? 1 : -1);
    const fx = horizontal ? ex : ex + bend;
    const fy = horizontal ? ey + bend : ey;
    traces.push([ex, ey, fx, fy]);
  }
  for (; i < count; i++) {
    const [ax, ay, bx, by] = traces[Math.floor(Math.random() * traces.length)]!;
    onSegment(i, ax, ay, bx, by);
  }

  return pts;
}

export class ParticleMorph extends FXScene {
  private material!: THREE.ShaderMaterial;
  private group = new THREE.Group();
  private assembled = { value: 0 };
  private started = false;

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);
    const count = lite ? 14000 : 42000;

    const geo = new THREE.BufferGeometry();
    const start = new Float32Array(count * 3);
    const rands = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // chaotic start: shell around the camera frustum
      const r = 9 + Math.random() * 22;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      start[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      start[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      start[i * 3 + 2] = r * Math.cos(phi) - 6;
      rands[i] = Math.random();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    geo.setAttribute('aTarget', new THREE.BufferAttribute(chipPoints(count), 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uScatter: { value: 0 },
        uPointer: { value: new THREE.Vector2() },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uColorA: { value: new THREE.Color(0x4fe3ff) },
        uColorB: { value: new THREE.Color(0x8b5bff) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, this.material);
    points.frustumCulled = false;
    this.group.add(points);
    this.scene.add(this.group);
    this.camera.position.set(0, 0, 13);

    const begin = () => {
      if (this.started) return;
      this.started = true;
    };
    window.addEventListener('site:enter', begin, { once: true });
    // Fallback if the preloader event never fires
    setTimeout(begin, 5000);
  }

  override update({ t, dt, scroll, vh, pointer }: UpdateArgs): void {
    // Assembly ease-in after the preloader lifts
    if (this.started && this.assembled.value < 1) {
      this.assembled.value = Math.min(1, this.assembled.value + dt * 0.45);
    }
    const e = this.assembled.value;
    const eased = e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;

    const u = this.material.uniforms;
    u.uTime.value = t;
    u.uProgress.value = eased;
    u.uScatter.value = Math.min(1, Math.max(0, scroll / (vh * 0.9)));
    (u.uPointer.value as THREE.Vector2).set(pointer.nx, pointer.ny);

    this.group.rotation.y = Math.sin(t * 0.1) * 0.12 + pointer.nx * 0.14;
    this.group.rotation.x = pointer.ny * -0.08;
    this.camera.position.z = 13 - eased * 1.5;
  }
}
