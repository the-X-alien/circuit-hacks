import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';
import gridVert from '../shaders/grid.vert.glsl';
import gridFrag from '../shaders/grid.frag.glsl';
import vert from '../shaders/crowd.vert.glsl';
import frag from '../shaders/crowd.frag.glsl';

/**
 * Thousands of low-poly figures in amphitheater rings — one draw call
 * via InstancedMesh, waves of motion via per-instance phase offsets.
 */
export class Crowd extends FXScene {
  private material!: THREE.ShaderMaterial;
  private gridMat!: THREE.ShaderMaterial;
  private smoothedP = 0;

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);

    const count = lite ? 1400 : 4200;
    const geo = new THREE.CapsuleGeometry(0.16, 0.55, 3, 8);

    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uTime: { value: 0 } },
    });

    const mesh = new THREE.InstancedMesh(geo, this.material, count);
    const m = new THREE.Matrix4();
    const phases = new Float32Array(count);
    const hues = new Float32Array(count);

    let placed = 0;
    let ring = 0;
    while (placed < count) {
      const radius = 5 + ring * 1.35;
      const slots = Math.floor(radius * 4.2);
      for (let s = 0; s < slots && placed < count; s++) {
        const a = (s / slots) * Math.PI * 2 + (ring % 2) * 0.12 + (Math.random() - 0.5) * 0.06;
        const r = radius + (Math.random() - 0.5) * 0.7;
        const scale = 0.85 + Math.random() * 0.45;
        m.makeScale(scale, scale, scale);
        m.setPosition(Math.cos(a) * r, 0.45 * scale, Math.sin(a) * r);
        mesh.setMatrixAt(placed, m);
        phases[placed] = Math.random() * Math.PI * 2 + r * 0.35;
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

    // Dim shared grid floor
    this.gridMat = new THREE.ShaderMaterial({
      vertexShader: gridVert,
      fragmentShader: gridFrag,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBrightness: { value: 0.4 },
      },
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), this.gridMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Central beacon the crowd faces
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.5, 26, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x4fe3ff,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    beacon.position.y = 13;
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
