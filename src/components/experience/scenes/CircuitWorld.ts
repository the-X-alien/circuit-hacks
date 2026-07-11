import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';
import gridVert from '../shaders/grid.vert.glsl';
import gridFrag from '../shaders/grid.frag.glsl';
import towersVert from '../shaders/towers.vert.glsl';
import towersFrag from '../shaders/towers.frag.glsl';

const CORRIDOR = 400; // camera travel distance

/**
 * "Motherboard city" — an endless glowing grid with instanced towers,
 * camera dollying down the center corridor as the user scrolls.
 */
export class CircuitWorld extends FXScene {
  private gridMat!: THREE.ShaderMaterial;
  private towerMat!: THREE.ShaderMaterial;
  private dust!: THREE.Points;
  private smoothedP = 0;

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);
    this.camera.far = 500;
    this.camera.updateProjectionMatrix();

    // Floor grid
    this.gridMat = new THREE.ShaderMaterial({
      vertexShader: gridVert,
      fragmentShader: gridFrag,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBrightness: { value: 1 },
      },
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 700), this.gridMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -CORRIDOR / 2;
    this.scene.add(floor);

    // Instanced towers lining the corridor
    const count = lite ? 260 : 800;
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.towerMat = new THREE.ShaderMaterial({
      vertexShader: towersVert,
      fragmentShader: towersFrag,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
      },
    });
    const towers = new THREE.InstancedMesh(box, this.towerMat, count);
    const m = new THREE.Matrix4();
    const heights = new Float32Array(count);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const side = Math.random() > 0.5 ? 1 : -1;
      const x = side * (7 + Math.random() * 42);
      const z = 20 - Math.random() * (CORRIDOR + 120);
      const h = 2 + Math.pow(Math.random(), 1.6) * 22;
      const wdt = 1.2 + Math.random() * 3.4;
      m.makeScale(wdt, h, wdt);
      m.setPosition(x, h / 2, z);
      towers.setMatrixAt(i, m);
      heights[i] = h / 24;
      seeds[i] = Math.random();
    }
    box.setAttribute('aHeight', new THREE.InstancedBufferAttribute(heights, 1));
    box.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    towers.instanceMatrix.needsUpdate = true;
    towers.frustumCulled = false;
    this.scene.add(towers);

    // Drifting data dust
    const dustCount = lite ? 300 : 900;
    const dustGeo = new THREE.BufferGeometry();
    const dp = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dp[i * 3] = (Math.random() - 0.5) * 90;
      dp[i * 3 + 1] = Math.random() * 26;
      dp[i * 3 + 2] = 20 - Math.random() * (CORRIDOR + 100);
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0x66d9ff,
        size: 0.14,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    this.camera.position.set(0, 5, 10);
  }

  override update({ t, dt, p, pointer }: UpdateArgs): void {
    this.smoothedP += (p - this.smoothedP) * Math.min(1, dt * 5);
    const sp = this.smoothedP;

    const z = 10 - sp * CORRIDOR;
    const sway = Math.sin(sp * Math.PI * 3) * 3.5;
    this.camera.position.set(sway + pointer.nx * 1.6, 5 + Math.sin(sp * Math.PI * 5) * 1.2 + pointer.ny * 0.9, z);
    this.camera.lookAt(sway * 0.3, 4.5, z - 40);

    this.gridMat.uniforms.uTime.value = t;
    this.gridMat.uniforms.uCam.value.copy(this.camera.position);
    this.towerMat.uniforms.uTime.value = t;
    this.towerMat.uniforms.uCam.value.copy(this.camera.position);

    this.dust.position.y = Math.sin(t * 0.3) * 0.8;
  }
}
