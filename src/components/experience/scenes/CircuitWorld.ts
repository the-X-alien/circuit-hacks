import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';
import pcbVert from '../shaders/pcb.vert.glsl';
import pcbFrag from '../shaders/pcb.frag.glsl';

const CORRIDOR = 420; // camera travel distance down the board

/**
 * A dive across a real circuit board: a copper-trace substrate with
 * mounted components — chips, LEDs, capacitors — and sparks of current
 * racing along the runs. The camera drones low over the board and
 * sinks deeper between the parts as the reader scrolls.
 */
export class CircuitWorld extends FXScene {
  private boardMat!: THREE.ShaderMaterial;
  private chips!: THREE.InstancedMesh;
  private pads!: THREE.InstancedMesh;
  private leds!: THREE.InstancedMesh;
  private ledMat!: THREE.MeshBasicMaterial;
  private caps!: THREE.InstancedMesh;
  private sparks!: THREE.Points;
  private smoothedP = 0;

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);
    this.camera.far = 600;
    this.camera.updateProjectionMatrix();

    // ── PCB substrate ──────────────────────────────────────────
    this.boardMat = new THREE.ShaderMaterial({
      vertexShader: pcbVert,
      fragmentShader: pcbFrag,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
      },
    });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(900, 1000), this.boardMat);
    board.rotation.x = -Math.PI / 2;
    board.position.z = -CORRIDOR / 2;
    this.scene.add(board);

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const place = (
      mesh: THREE.InstancedMesh,
      i: number,
      x: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      ry: number
    ) => {
      const m = new THREE.Matrix4();
      m.makeRotationY(ry);
      m.scale(new THREE.Vector3(sx, sy, sz));
      m.setPosition(x, sy / 2, z);
      mesh.setMatrixAt(i, m);
    };

    // ── Chips (dark dies on a gold lead-frame) ────────────────
    const chipCount = lite ? 70 : 190;
    const chipGeo = new THREE.BoxGeometry(1, 1, 1);
    this.chips = new THREE.InstancedMesh(
      chipGeo,
      new THREE.MeshBasicMaterial({ color: 0x0a0f16 }),
      chipCount
    );
    this.pads = new THREE.InstancedMesh(
      chipGeo,
      new THREE.MeshBasicMaterial({ color: 0xb9863a }),
      chipCount
    );
    const chipSeeds = new Float32Array(chipCount);
    for (let i = 0; i < chipCount; i++) {
      const x = rand(-46, 46);
      const z = 24 - Math.random() * (CORRIDOR + 120);
      const sx = rand(1.6, 4.2);
      const sz = rand(1.6, 4.2);
      const sy = rand(0.5, 1.4);
      const ry = (Math.random() < 0.5 ? 0 : Math.PI / 2) + rand(-0.15, 0.15);
      place(this.chips, i, x, z, sx, sy, sz, ry);
      place(this.pads, i, x, z, sx + 0.5, 0.12, sz + 0.5, ry);
      chipSeeds[i] = Math.random();
    }
    const chipH = new Float32Array(chipCount);
    for (let i = 0; i < chipCount; i++) chipH[i] = Math.random();
    chipGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(chipSeeds, 1));
    this.chips.instanceMatrix.needsUpdate = true;
    this.pads.instanceMatrix.needsUpdate = true;
    this.chips.frustumCulled = false;
    this.pads.frustumCulled = false;
    this.scene.add(this.chips);
    this.scene.add(this.pads);

    // ── Capacitors (bronze cylinders) ─────────────────────────
    const capCount = lite ? 40 : 130;
    this.caps = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.32, 0.32, 1, 12),
      new THREE.MeshBasicMaterial({ color: 0x9c6a3a }),
      capCount
    );
    for (let i = 0; i < capCount; i++) {
      const x = rand(-48, 48);
      const z = 24 - Math.random() * (CORRIDOR + 120);
      const h = rand(0.8, 2.2);
      const m = new THREE.Matrix4();
      m.makeScale(rand(0.7, 1.3), h, rand(0.7, 1.3));
      m.setPosition(x, h / 2, z);
      this.caps.setMatrixAt(i, m);
    }
    this.caps.instanceMatrix.needsUpdate = true;
    this.caps.frustumCulled = false;
    this.scene.add(this.caps);

    // ── LEDs (emissive gold, pulsing) ─────────────────────────
    const ledCount = lite ? 50 : 150;
    this.ledMat = new THREE.MeshBasicMaterial({
      color: 0xf7d98c,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.leds = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.34, 10),
      this.ledMat,
      ledCount
    );
    for (let i = 0; i < ledCount; i++) {
      const x = rand(-48, 48);
      const z = 24 - Math.random() * (CORRIDOR + 120);
      const m = new THREE.Matrix4();
      m.makeScale(1, 1, 1);
      m.setPosition(x, 0.17, z);
      this.leds.setMatrixAt(i, m);
    }
    this.leds.instanceMatrix.needsUpdate = true;
    this.leds.frustumCulled = false;
    this.scene.add(this.leds);

    // ── Current sparks racing along the copper ────────────────
    const sparkCount = lite ? 240 : 700;
    const sparkGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(sparkCount * 3);
    for (let i = 0; i < sparkCount; i++) {
      sp[i * 3] = rand(-60, 60);
      sp[i * 3 + 1] = rand(0.15, 1.4);
      sp[i * 3 + 2] = 24 - Math.random() * (CORRIDOR + 120);
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.sparks = new THREE.Points(
      sparkGeo,
      new THREE.PointsMaterial({
        color: 0xffd98a,
        size: 0.22,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);

    this.camera.position.set(0, 7, 10);
  }

  override update({ t, dt, p, pointer }: UpdateArgs): void {
    this.smoothedP += (p - this.smoothedP) * Math.min(1, dt * 5);
    const sp = this.smoothedP;

    // Dive deeper into the board as we scroll
    const z = 10 - sp * CORRIDOR;
    const sway = Math.sin(sp * Math.PI * 2.4) * 4.0 + pointer.nx * 2.2;
    const height = 7 - sp * 4.6; // sink from 7 down to ~2.4
    this.camera.position.set(
      sway,
      height + Math.sin(sp * Math.PI * 4) * 0.5 + pointer.ny * 1.1,
      z
    );
    this.camera.lookAt(sway * 0.4, height * 0.35, z - 38);

    this.boardMat.uniforms.uTime.value = t;
    this.boardMat.uniforms.uCam.value.copy(this.camera.position);

    // LED breathing
    this.ledMat.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.2));

    // Sparks drift along +x and wrap
    const pos = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const speed = dt * 14;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += speed;
      if (arr[i] > 62) arr[i] = -62;
    }
    pos.needsUpdate = true;
  }
}
