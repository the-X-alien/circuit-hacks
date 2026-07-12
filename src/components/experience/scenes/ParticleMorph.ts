import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';

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

  for (const end = i + take(0.15); i < end; i++) {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) onSegment(i, -HALF, HALF, HALF, HALF);
    else if (side === 1) onSegment(i, HALF, HALF, HALF, -HALF);
    else if (side === 2) onSegment(i, HALF, -HALF, -HALF, -HALF);
    else onSegment(i, -HALF, -HALF, -HALF, HALF);
  }

  const DIE = 1.3;
  for (const end = i + take(0.08); i < end; i++) {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) onSegment(i, -DIE, DIE, DIE, DIE);
    else if (side === 1) onSegment(i, DIE, DIE, DIE, -DIE);
    else if (side === 2) onSegment(i, DIE, -DIE, -DIE, -DIE);
    else onSegment(i, -DIE, -DIE, -DIE, DIE);
  }

  const padCoords: [number, number][] = [];
  for (let px = -2.2; px <= 2.2; px += 1.1) {
    for (let py = -2.2; py <= 2.2; py += 1.1) {
      if (Math.abs(px) < DIE + 0.3 && Math.abs(py) < DIE + 0.3) continue;
      padCoords.push([px, py]);
    }
  }
  for (const end = i + take(0.12); i < end; i++) {
    const [px, py] = padCoords[Math.floor(Math.random() * padCoords.length)]!;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.22;
    pts[i * 3] = px + Math.cos(a) * r;
    pts[i * 3 + 1] = py + Math.sin(a) * r;
    pts[i * 3 + 2] = rand(-0.1, 0.1);
  }

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

  for (; i < count; i++) {
    const [ax, ay, bx, by] = pinEnds[Math.floor(Math.random() * pinEnds.length)]!;
    onSegment(i, ax, ay, bx, by);
  }

  return pts;
}

export class ParticleMorph extends FXScene {
  private material!: THREE.ShaderMaterial;
  private glowMaterial!: THREE.ShaderMaterial;
  private group = new THREE.Group();
  private assembled = { value: 0 };
  private started = false;

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);
    const count = lite ? 14000 : 42000;
    const glowCount = Math.floor(count * 0.12);

    const geo = new THREE.BufferGeometry();
    const start = new Float32Array(count * 3);
    const rands = new Float32Array(count);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 9 + Math.random() * 22;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      start[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      start[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      start[i * 3 + 2] = r * Math.cos(phi) - 6;
      rands[i] = Math.random();
      sizes[i] = 0.6 + Math.random() * 2.4;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    geo.setAttribute('aTarget', new THREE.BufferAttribute(chipPoints(count), 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

    this.material = new THREE.ShaderMaterial({
      vertexShader: `
        uniform float uTime;
        uniform float uProgress;
        uniform float uScatter;
        uniform vec2 uPointer;
        uniform float uPixelRatio;

        attribute vec3 aStart;
        attribute vec3 aTarget;
        attribute float aRand;

        varying float vAlpha;
        varying float vSize;

        vec3 wobble(vec3 p, float t, float r) {
          return vec3(
            sin(t * 0.6 + r * 17.0 + p.y * 0.8),
            cos(t * 0.5 + r * 23.0 + p.x * 0.7),
            sin(t * 0.7 + r * 11.0 + p.z * 0.9)
          );
        }

        void main() {
          vec3 pos = mix(aStart, aTarget, uProgress);
          float j = mix(0.55, 0.05, uProgress);
          pos += wobble(pos, uTime + aRand * 10.0, aRand) * j;

          vec3 dir = normalize(pos + vec3(0.0001));
          pos += dir * uScatter * (6.0 + aRand * 18.0);
          pos.z += uScatter * (12.0 + aRand * 24.0);

          vec4 mv = modelViewMatrix * vec4(pos, 1.0);

          vec2 scr = mv.xy / max(0.001, -mv.z);
          float d = distance(scr, uPointer * 0.55);
          float force = smoothstep(0.28, 0.0, d);
          mv.xy += normalize(scr - uPointer * 0.55 + 0.0001) * force * 1.4;

          gl_Position = projectionMatrix * mv;
          float baseSize = 1.1 + aRand * 2.4;
          float growth = 1.0 + 0.4 * (1.0 - uProgress);
          gl_PointSize = baseSize * growth * uPixelRatio * (30.0 / max(0.001, -mv.z));

          vAlpha = (0.5 + 0.5 * sin(uTime * (0.4 + aRand * 0.8) + aRand * 40.0)) * (1.0 - uScatter * 0.9);
          vSize = baseSize;
        }
      `,
      fragmentShader: `
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uTime;

        varying float vAlpha;
        varying float vSize;

        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.04, d);
          float core = smoothstep(0.2, 0.0, d);
          vec3 col = mix(uColorA, uColorB, c.y * 0.5 + 0.5 * sin(c.x * 3.0 + uTime));
          col += vec3(1.0) * core * 0.35;
          gl_FragColor = vec4(col, a * vAlpha);
        }
      `,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uScatter: { value: 0 },
        uPointer: { value: new THREE.Vector2() },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uColorA: { value: new THREE.Color(0xe6b54a) },
        uColorB: { value: new THREE.Color(0x6fa8d6) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, this.material);
    points.frustumCulled = false;
    this.group.add(points);

    // Glow particle halo — larger, dimmer particles orbiting
    this.glowMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        uniform float uTime;
        uniform float uProgress;
        uniform float uPixelRatio;

        attribute vec3 aStart;
        attribute vec3 aTarget;
        attribute float aRand;

        varying float vAlpha;

        void main() {
          vec3 pos = mix(aStart, aTarget, uProgress);
          float j = mix(0.8, 0.1, uProgress);
          pos.x += sin(uTime * 0.3 + aRand * 30.0) * j;
          pos.y += cos(uTime * 0.25 + aRand * 20.0) * j;
          pos.z += sin(uTime * 0.35 + aRand * 40.0) * j;

          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (3.0 + aRand * 5.0) * uPixelRatio * (25.0 / max(0.001, -mv.z));

          float pulse = 0.5 + 0.5 * sin(uTime * 0.5 + aRand * 60.0);
          vAlpha = (0.08 + 0.12 * pulse) * (1.0 - uProgress * 0.5);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(0.7, 0.55, 0.25, a * vAlpha * 0.3);
        }
      `,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const glowGeo = new THREE.BufferGeometry();
    const gStart = new Float32Array(glowCount * 3);
    const gTarget = new Float32Array(glowCount * 3);
    const gRand = new Float32Array(glowCount);
    for (let i = 0; i < glowCount; i++) {
      const r = 12 + Math.random() * 28;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      gStart[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      gStart[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      gStart[i * 3 + 2] = r * Math.cos(phi) - 8;
      gTarget[i * 3] = (Math.random() - 0.5) * 14;
      gTarget[i * 3 + 1] = (Math.random() - 0.5) * 14;
      gTarget[i * 3 + 2] = (Math.random() - 0.5) * 4;
      gRand[i] = Math.random();
    }
    glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(glowCount * 3), 3));
    glowGeo.setAttribute('aStart', new THREE.BufferAttribute(gStart, 3));
    glowGeo.setAttribute('aTarget', new THREE.BufferAttribute(gTarget, 3));
    glowGeo.setAttribute('aRand', new THREE.BufferAttribute(gRand, 1));
    const glowPoints = new THREE.Points(glowGeo, this.glowMaterial);
    glowPoints.frustumCulled = false;
    this.group.add(glowPoints);

    this.scene.add(this.group);
    this.camera.position.set(0, 0, 13);

    const begin = () => {
      if (this.started) return;
      this.started = true;
    };
    window.addEventListener('site:enter', begin, { once: true });
    setTimeout(begin, 5000);
  }

  override update({ t, dt, scroll, vh, pointer }: UpdateArgs): void {
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

    this.glowMaterial.uniforms.uTime.value = t;
    this.glowMaterial.uniforms.uProgress.value = eased;

    this.group.rotation.y = Math.sin(t * 0.1) * 0.12 + pointer.nx * 0.14;
    this.group.rotation.x = pointer.ny * -0.08;
    this.camera.position.z = 13 - eased * 1.5;
  }
}
