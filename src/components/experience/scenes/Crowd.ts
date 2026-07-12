import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';
import gridVert from '../shaders/grid.vert.glsl';
import gridFrag from '../shaders/grid.frag.glsl';

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = geos.reduce((s, g) => {
    const p = g.getAttribute('position');
    return s + (p ? p.count : 0);
  }, 0);
  const pos = new Float32Array(total * 3);
  const norm = new Float32Array(total * 3);
  let off = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    if (!p || !n) continue;
    for (let i = 0; i < p.count; i++) {
      pos[(off + i) * 3] = p.array[i * 3];
      pos[(off + i) * 3 + 1] = p.array[i * 3 + 1];
      pos[(off + i) * 3 + 2] = p.array[i * 3 + 2];
      norm[(off + i) * 3] = n.array[i * 3];
      norm[(off + i) * 3 + 1] = n.array[i * 3 + 1];
      norm[(off + i) * 3 + 2] = n.array[i * 3 + 2];
    }
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  return out;
}

function humanoidGeo(detail: number): THREE.BufferGeometry {
  const head = new THREE.SphereGeometry(0.18, detail, detail);
  head.translate(0, 0.62, 0);
  const body = new THREE.CylinderGeometry(0.12, 0.18, 0.55, detail, 2);
  body.translate(0, 0.25, 0);
  const merged = mergeGeos([body, head]);
  merged.computeVertexNormals();
  return merged;
}

export class Crowd extends FXScene {
  private material!: THREE.ShaderMaterial;
  private gridMat!: THREE.ShaderMaterial;
  private smoothedP = 0;

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);

    const count = lite ? 1200 : 3600;
    const detail = lite ? 4 : 6;
    const geo = humanoidGeo(detail);

    this.material = new THREE.ShaderMaterial({
      vertexShader: `
        uniform float uTime;
        attribute float aPhase;
        attribute float aHue;
        varying float vY;
        varying float vHue;
        varying float vDist;

        void main() {
          vY = clamp(position.y / 0.9 + 0.5, 0.0, 1.0);
          vHue = aHue;
          vec3 p = position;

          float wave1 = sin(uTime * 1.8 + aPhase) * 0.05;
          float wave2 = sin(uTime * 1.2 + aPhase * 1.4 + 1.5) * 0.04;
          p.x += (wave1 + wave2) * (0.3 + 0.7 * vY);
          p.z += cos(uTime * 1.5 + aPhase * 1.1) * 0.03 * vY;
          p.y += sin(uTime * 2.4 + aPhase * 1.8) * 0.025 * vY;

          vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vec4 mv = viewMatrix * w;
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying float vY;
        varying float vHue;
        varying float vDist;

        void main() {
          vec3 gold = vec3(0.92, 0.72, 0.30);
          vec3 blue = vec3(0.44, 0.66, 0.84);
          vec3 bronze = vec3(0.74, 0.52, 0.30);

          vec3 tint = mix(gold, bronze, vHue);
          tint = mix(tint, blue, smoothstep(0.3, 0.7, vHue));

          vec3 col = mix(vec3(0.01, 0.015, 0.03), tint * 0.9, pow(vY, 1.5));
          float rim = pow(1.0 - abs(vY - 0.5) * 2.0, 2.0);
          col += gold * rim * 0.12;

          float headGlow = smoothstep(0.15, 0.0, abs(vY - 0.8));
          col += bronze * headGlow * 0.25;

          float fade = exp(-vDist * 0.025);
          col *= 0.15 + 0.85 * fade;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      uniforms: { uTime: { value: 0 } },
    });

    const mesh = new THREE.InstancedMesh(geo, this.material, count);
    const m = new THREE.Matrix4();
    const phases = new Float32Array(count);
    const hues = new Float32Array(count);

    let placed = 0;
    let ring = 0;
    while (placed < count) {
      const radius = 4.5 + ring * 1.25;
      const slots = Math.floor(radius * 4.8);
      for (let s = 0; s < slots && placed < count; s++) {
        const a = (s / slots) * Math.PI * 2 + (ring % 2) * 0.1 + (Math.random() - 0.5) * 0.05;
        const r = radius + (Math.random() - 0.5) * 0.6;
        const scale = 0.85 + Math.random() * 0.55;
        m.makeScale(scale, scale, scale);
        m.setPosition(Math.cos(a) * r, 0.45 * scale, Math.sin(a) * r);
        mesh.setMatrixAt(placed, m);
        phases[placed] = Math.random() * Math.PI * 2 + r * 0.3;
        hues[placed] = Math.random();
        placed++;
      }
      ring++;
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    geo.setAttribute('aHue', new THREE.InstancedBufferAttribute(hues, 1));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    this.gridMat = new THREE.ShaderMaterial({
      vertexShader: gridVert,
      fragmentShader: gridFrag,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBrightness: { value: 0.35 },
      },
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), this.gridMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.35, 28, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xbcd3e6,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    beacon.position.y = 14;
    this.scene.add(beacon);

    this.camera.position.set(0, 6, 30);
  }

  override update({ t, dt, p, pointer }: UpdateArgs): void {
    this.smoothedP += (p - this.smoothedP) * Math.min(1, dt * 5);
    const sp = this.smoothedP;

    const angle = sp * Math.PI * 0.7 + t * 0.02;
    const radius = 34 - sp * 12;
    this.camera.position.set(
      Math.cos(angle) * radius + pointer.nx * 2,
      7 + sp * 6 + pointer.ny * 1.4,
      Math.sin(angle) * radius
    );
    this.camera.lookAt(0, 3.5, 0);

    this.material.uniforms.uTime.value = t;
    this.gridMat.uniforms.uTime.value = t;
    this.gridMat.uniforms.uCam.value.copy(this.camera.position);
  }
}
