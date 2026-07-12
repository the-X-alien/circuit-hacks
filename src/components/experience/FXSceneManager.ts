import * as THREE from 'three';
import fullscreenVert from './shaders/fullscreen.vert.glsl';
import compositeFrag from './shaders/composite.frag.glsl';

export interface UpdateArgs {
  t: number;
  dt: number;
  /** camera-path progress for this scene, 0..1 */
  p: number;
  /** raw page scroll offset in px */
  scroll: number;
  /** viewport height in px */
  vh: number;
  pointer: { nx: number; ny: number };
  renderer: THREE.WebGLRenderer;
}

export abstract class FXScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  initialized = false;

  init(_renderer: THREE.WebGLRenderer, _lite: boolean): void {
    this.initialized = true;
  }

  abstract update(args: UpdateArgs): void;

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x0c0b09, 1);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

export function fullscreenTriangle(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
  );
  return geo;
}

/**
 * Renders the active FXScene(s) into HDR render targets and composites
 * them to screen with crossfade, tone mapping, vignette and grain.
 */
export class FXSceneManager {
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private compositeScene = new THREE.Scene();
  private compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;

  constructor(w: number, h: number) {
    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(w, h, opts);
    this.rtB = new THREE.WebGLRenderTarget(w, h, opts);

    this.material = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: compositeFrag,
      uniforms: {
        tA: { value: this.rtA.texture },
        tB: { value: this.rtB.texture },
        uMix: { value: 0 },
        uDim: { value: 1 },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(w, h) },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uMouseA: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(fullscreenTriangle(), this.material);
    quad.frustumCulled = false;
    this.compositeScene.add(quad);
  }

  resize(w: number, h: number): void {
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
  }

  private prevMouse = new THREE.Vector2(0.5, 0.5);

  render(
    renderer: THREE.WebGLRenderer,
    sceneA: FXScene,
    sceneB: FXScene | null,
    mix: number,
    dim: number,
    time: number,
    pointer: { nx: number; ny: number }
  ): void {
    sceneA.render(renderer, this.rtA);
    if (sceneB && mix > 0.001) {
      sceneB.render(renderer, this.rtB);
    }
    const u = this.material.uniforms;
    u.uMix.value = sceneB ? mix : 0;
    u.uDim.value = dim;
    u.uTime.value = time;
    const tu = u.uMouse.value as THREE.Vector2;
    const tx = pointer.nx * 0.5 + 0.5;
    const ty = pointer.ny * 0.5 + 0.5;
    tu.x += (tx - tu.x) * 0.18;
    tu.y += (ty - tu.y) * 0.18;
    const moved = Math.hypot(tx - this.prevMouse.x, ty - this.prevMouse.y);
    this.prevMouse.set(tx, ty);
    u.uMouseA.value = Math.min(1, (u.uMouseA.value as number) * 0.92 + moved * 6.0);
    renderer.setRenderTarget(null);
    renderer.render(this.compositeScene, this.compositeCamera);
  }
}
