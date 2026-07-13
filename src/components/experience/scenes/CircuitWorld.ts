import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FXScene, type UpdateArgs } from '../FXSceneManager';
import pcbVert from '../shaders/pcb.vert.glsl';
import pcbFrag from '../shaders/pcb.frag.glsl';

// Real board model (CC BY 4.0 — "Circuit Board (Free Download)" by Flikd Design).
// Drop the downloaded file at public/models/circuit-board.glb. If it is missing,
// the scene falls back to the procedural components below.
const BOARD_MODEL_URL = '/models/circuit-board.glb';
const MODEL_ROTATE_X = 0; // radians — tweak if the board loads standing up
const MODEL_FOOTPRINT = 120; // world units the board is scaled to across the corridor

const CORRIDOR = 600;
const BOARD_W = 300;
const BOARD_D = 900;

function rnd(a: number, b: number) { return a + Math.random() * (b - a); }

export class CircuitWorld extends FXScene {
  private boardMat!: THREE.ShaderMaterial;
  private pcbTex!: THREE.Texture;
  private chips: THREE.Mesh[] = [];
  private caps: THREE.Mesh[] = [];
  private resistors: THREE.Mesh[] = [];
  private sparkParticles!: THREE.Points;
  private glowParticles!: THREE.Points;
  private traceGroup = new THREE.Group();
  private proceduralGroup = new THREE.Group();
  private modelGroup = new THREE.Group();
  private smoothedP = 0;

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);
    this.camera.far = 800;
    this.camera.updateProjectionMatrix();

    // Load real PCB photo as texture
    const loader = new THREE.TextureLoader();
    this.pcbTex = loader.load('/pcb-texture.jpg');
    this.pcbTex.wrapS = this.pcbTex.wrapT = THREE.RepeatWrapping;
    this.pcbTex.repeat.set(0.5, 2);
    this.pcbTex.anisotropy = 8;

    this.boardMat = new THREE.ShaderMaterial({
      vertexShader: pcbVert,
      fragmentShader: pcbFrag,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uPcbTex: { value: this.pcbTex },
      },
    });
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_D),
      this.boardMat
    );
    board.rotation.x = -Math.PI / 2;
    board.position.set(0, -0.5, -CORRIDOR / 2);
    this.scene.add(board);

    // ── 3D traces on top of texture ────────────────────────────
    const copper = new THREE.Color(0xb87333);
    const gold = new THREE.Color(0xd4af37);

    // Bus routes (thick traces)
    const busLanes = [-90, -60, -30, 0, 30, 60, 90];
    for (const laneX of busLanes) {
      const pts: THREE.Vector3[] = [];
      const segs = 10;
      let x = laneX + rnd(-3, 3);
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const z = 20 - t * CORRIDOR * 0.95;
        x += rnd(-4, 4);
        pts.push(new THREE.Vector3(x, 0.015, z));
      }
      try {
        const curve = new THREE.CatmullRomCurve3(pts);
        const mesh = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 16, rnd(0.3, 0.6), 4, false),
          new THREE.MeshBasicMaterial({ color: copper, transparent: true, opacity: 0.75 })
        );
        mesh.frustumCulled = false;
        this.traceGroup.add(mesh);
      } catch {}
    }

    // Dense signal traces
    for (let i = 0; i < (lite ? 30 : 100); i++) {
      const xBase = rnd(-BOARD_W * 0.38, BOARD_W * 0.38);
      const zStart = rnd(10, 80);
      const zLen = rnd(80, 400);
      const pts: THREE.Vector3[] = [];
      const segs = 6 + Math.floor(Math.random() * 4);
      for (let j = 0; j <= segs; j++) {
        const t = j / segs;
        const z = zStart - t * zLen;
        const zigX = xBase + Math.sin(t * Math.PI * 4 + rnd(0, 2)) * rnd(3, 10);
        pts.push(new THREE.Vector3(zigX, 0.01, z));
      }
      try {
        const curve = new THREE.CatmullRomCurve3(pts);
        const mesh = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 10, rnd(0.08, 0.2), 3, false),
          new THREE.MeshBasicMaterial({ color: copper, transparent: true, opacity: 0.6 })
        );
        mesh.frustumCulled = false;
        this.traceGroup.add(mesh);
      } catch {}
    }

    // Gold power traces
    for (let i = 0; i < (lite ? 4 : 12); i++) {
      const x = rnd(-BOARD_W * 0.3, BOARD_W * 0.3);
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 6; j++) {
        const t = j / 6;
        const z = 30 - t * CORRIDOR * 0.9;
        pts.push(new THREE.Vector3(x + rnd(-1, 1), 0.02, z));
      }
      try {
        const curve = new THREE.CatmullRomCurve3(pts);
        const mesh = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 10, rnd(0.2, 0.4), 4, false),
          new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.5 })
        );
        mesh.frustumCulled = false;
        this.traceGroup.add(mesh);

        // Glow halo
        const glow = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 10, 0.5, 4, false),
          new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        glow.frustumCulled = false;
        this.traceGroup.add(glow);
      } catch {}
    }

    // Vias
    const viaMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.4 });
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x050a05 });
    for (let i = 0; i < (lite ? 50 : 200); i++) {
      const x = rnd(-BOARD_W * 0.4, BOARD_W * 0.4);
      const z = rnd(-CORRIDOR + 60, -20);
      const via = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 8), viaMat);
      via.position.set(x, 0.02, z);
      via.frustumCulled = false;
      this.traceGroup.add(via);

      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 6), holeMat);
      hole.position.set(x, 0.025, z);
      hole.frustumCulled = false;
      this.traceGroup.add(hole);
    }

    this.proceduralGroup.add(this.traceGroup);

    // ── Components ───────────────────────────────────────────
    const chipMat = new THREE.MeshStandardMaterial({ color: 0x0a0f16, metalness: 0.3, roughness: 0.6 });
    const pinMat = new THREE.MeshBasicMaterial({ color: 0xd4af37 });

    // ICs with visible legs
    for (let i = 0; i < (lite ? 20 : 60); i++) {
      const x = rnd(-BOARD_W * 0.38, BOARD_W * 0.38);
      const z = rnd(-CORRIDOR + 80, -30);
      const w = rnd(1.0, 3.5);
      const d = rnd(1.0, 3.5);
      const h = rnd(0.3, 1.8);

      const chip = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), chipMat);
      chip.position.set(x, h / 2, z);
      chip.castShadow = false;
      this.proceduralGroup.add(chip);
      this.chips.push(chip);

      // Pins
      const legsPerSide = Math.max(2, Math.floor((w + d) * 0.6));
      for (let pi = 0; pi < legsPerSide * 4; pi++) {
        const side = pi % 4;
        const legIdx = Math.floor(pi / 4);
        const spacing = (side < 2 ? w : d) / (legsPerSide + 1);
        const lp = (legIdx - (legsPerSide - 1) / 2) * spacing;
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.03, h * 0.6, 0.08), pinMat
        );
        leg.position.set(x, h * 0.35, z);
        if (side === 0) { leg.position.x += w / 2 + 0.015; leg.position.z += lp; }
        else if (side === 1) { leg.position.x -= w / 2 + 0.015; leg.position.z += lp; }
        else if (side === 2) { leg.position.z += d / 2 + 0.015; leg.position.x += lp; leg.rotation.y = Math.PI / 2; }
        else { leg.position.z -= d / 2 + 0.015; leg.position.x += lp; leg.rotation.y = Math.PI / 2; }
        this.proceduralGroup.add(leg);
      }

      // Solder pads
      for (let pi = 0; pi < 4; pi++) {
        const pad = new THREE.Mesh(
          new THREE.CircleGeometry(0.06, 6),
          new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
        );
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(
          x + (pi < 2 ? (pi === 0 ? w * 0.3 : -w * 0.3) : 0),
          0.01,
          z + (pi >= 2 ? (pi === 2 ? d * 0.3 : -d * 0.3) : 0)
        );
        this.proceduralGroup.add(pad);
      }
    }

    // Capacitors (electrolytic - can style)
    for (let i = 0; i < (lite ? 30 : 80); i++) {
      const x = rnd(-BOARD_W * 0.38, BOARD_W * 0.38);
      const z = rnd(-CORRIDOR + 60, -20);
      const h = rnd(0.5, 1.8);
      const r = rnd(0.12, 0.35);

      const can = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, h, 10),
        new THREE.MeshStandardMaterial({ color: 0x2a3a2a, metalness: 0.4, roughness: 0.5 })
      );
      can.position.set(x, h / 2 - 0.5, z);
      this.proceduralGroup.add(can);
      this.caps.push(can);

      const top = new THREE.Mesh(
        new THREE.CircleGeometry(r * 0.6, 8),
        new THREE.MeshBasicMaterial({ color: 0x3a4a3a, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      );
      top.rotation.x = -Math.PI / 2;
      top.position.set(x, h - 0.5, z);
      this.proceduralGroup.add(top);

      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.03, h * 0.5),
        new THREE.MeshBasicMaterial({ color: 0xf5f5f0, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
      );
      stripe.position.set(x + r + 0.005, h / 2 - 0.5, z);
      stripe.rotation.y = Math.PI / 2;
      this.proceduralGroup.add(stripe);
    }

    // Resistors
    for (let i = 0; i < (lite ? 20 : 50); i++) {
      const x = rnd(-BOARD_W * 0.38, BOARD_W * 0.38);
      const z = rnd(-CORRIDOR + 50, -20);
      const len = rnd(0.3, 0.8);
      const r = rnd(0.05, 0.09);
      const dir = Math.random() > 0.5 ? 'x' : 'z';
      const bodyColor = [0x8b4513, 0x2f4f4f, 0x8b0000, 0x556b2f, 0x4a0e4e][Math.floor(Math.random() * 5)]!;

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, len, 6),
        new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8 })
      );
      body.rotation.x = Math.PI / 2;
      if (dir === 'z') body.rotation.z = Math.PI / 2;
      body.position.set(x, 0.07, z);
      this.proceduralGroup.add(body);
      this.resistors.push(body);

      for (let s = -1; s <= 1; s += 2) {
        const lead = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 0.15, 3),
          new THREE.MeshBasicMaterial({ color: 0x808080 })
        );
        lead.rotation.x = Math.PI / 2;
        if (dir === 'z') lead.rotation.z = Math.PI / 2;
        lead.position.set(
          x + (dir === 'x' ? s * (len / 2 + 0.08) : 0),
          0.015,
          z + (dir === 'z' ? s * (len / 2 + 0.08) : 0)
        );
        this.proceduralGroup.add(lead);
      }
    }

    // ── Glow particles (LEDs) ─────────────────────────────────
    const glowCount = lite ? 200 : 700;
    const glowGeo = new THREE.BufferGeometry();
    const glowPos = new Float32Array(glowCount * 3);
    const glowCol = new Float32Array(glowCount * 3);
    const glowSeed = new Float32Array(glowCount);
    for (let i = 0; i < glowCount; i++) {
      glowPos[i * 3] = rnd(-BOARD_W * 0.45, BOARD_W * 0.45);
      glowPos[i * 3 + 1] = rnd(0.1, 1.5);
      glowPos[i * 3 + 2] = rnd(-CORRIDOR + 30, -10);
      const c = new THREE.Color(Math.random() < 0.4 ? 0x6fa8d6 : Math.random() < 0.6 ? 0xe6b54a : 0xbd8550);
      glowCol[i * 3] = c.r; glowCol[i * 3 + 1] = c.g; glowCol[i * 3 + 2] = c.b;
      glowSeed[i] = Math.random();
    }
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
    glowGeo.setAttribute('color', new THREE.BufferAttribute(glowCol, 3));
    glowGeo.setAttribute('seed', new THREE.BufferAttribute(glowSeed, 1));
    this.glowParticles = new THREE.Points(glowGeo, new THREE.ShaderMaterial({
      vertexShader: `attribute vec3 color;attribute float seed;uniform float uTime;varying vec3 vCol;varying float vSeed;void main(){vCol=color;vSeed=seed;vec3 p=position;p.y+=sin(uTime*0.8+seed*10.0)*0.2;vec4 mv=modelViewMatrix*vec4(p,1.0);gl_PointSize=(2.0+seed*4.0)*(40.0/-mv.z);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying vec3 vCol;varying float vSeed;uniform float uTime;void main(){float d=length(gl_PointCoord-0.5);if(d>0.5)discard;float a=smoothstep(0.5,0.0,d);float pulse=0.5+0.5*sin(uTime*1.2+vSeed*60.0);gl_FragColor=vec4(vCol,a*0.5*pulse);}`,
      uniforms: { uTime: { value: 0 } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.glowParticles.frustumCulled = false;
    this.scene.add(this.glowParticles);

    // ── Spark particles ───────────────────────────────────────
    const sparkCount = lite ? 200 : 600;
    const sparkGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(sparkCount * 3);
    const spSpeed = new Float32Array(sparkCount);
    for (let i = 0; i < sparkCount; i++) {
      sp[i * 3] = rnd(-BOARD_W * 0.4, BOARD_W * 0.4);
      sp[i * 3 + 1] = rnd(0.1, 0.6);
      sp[i * 3 + 2] = rnd(-CORRIDOR + 20, -10);
      spSpeed[i] = 15 + Math.random() * 25;
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sparkGeo.setAttribute('speed', new THREE.BufferAttribute(spSpeed, 1));
    this.sparkParticles = new THREE.Points(sparkGeo, new THREE.ShaderMaterial({
      vertexShader: `attribute float speed;uniform float uTime;varying float vAlpha;void main(){vec3 p=position;float t=mod(uTime*0.3+speed*0.01,1.0);p.z=mix(-CORRIDOR+20.0,-10.0,t);p.x+=sin(uTime*0.5+p.z*0.1)*2.0;vAlpha=sin(t*3.14);vec4 mv=modelViewMatrix*vec4(p,1.0);gl_PointSize=2.0*(30.0/-mv.z);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying float vAlpha;void main(){float d=length(gl_PointCoord-0.5);if(d>0.5)discard;float a=smoothstep(0.5,0.0,d);gl_FragColor=vec4(0.90,0.71,0.29,a*vAlpha*0.8);}`,
      uniforms: { uTime: { value: 0 } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.sparkParticles.frustumCulled = false;
    this.scene.add(this.sparkParticles);

    const hemi = new THREE.HemisphereLight(0x6fa8d6, 0x1b5e20, 0.8);
    this.scene.add(hemi);
    const dirLight = new THREE.DirectionalLight(0xf7d98c, 0.4);
    dirLight.position.set(10, 20, 10);
    this.scene.add(dirLight);

    this.scene.add(this.proceduralGroup);
    this.scene.add(this.modelGroup);
    this.loadBoardModel(lite);

    this.camera.position.set(0, 4, 15);
    this.camera.lookAt(0, 1, -20);
  }

  /**
   * Loads the real board model and tiles it down the corridor. On success the
   * procedural stand-in components are hidden; on any failure they stay, so the
   * scene always has content whether or not the .glb is present.
   */
  private loadBoardModel(lite: boolean): void {
    new GLTFLoader().load(
      BOARD_MODEL_URL,
      (gltf) => {
        const model = gltf.scene;
        // Brighten the imported PBR materials so they read over the dark scene.
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.frustumCulled = false;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat && 'emissive' in mat) {
              mat.emissive = new THREE.Color(0x101a12);
              mat.emissiveIntensity = 0.4;
            }
          }
        });

        // Centre, lay flat, and scale to the corridor footprint.
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        model.position.sub(center);
        model.rotation.x = MODEL_ROTATE_X;
        const footprint = Math.max(size.x, size.z) || 1;
        const scale = MODEL_FOOTPRINT / footprint;

        const tileDepth = Math.max(size.x, size.z) * scale * 0.96;
        const tiles = Math.min(lite ? 4 : 7, Math.ceil(CORRIDOR / tileDepth) + 1);
        for (let i = 0; i < tiles; i++) {
          const clone = model.clone(true);
          clone.scale.setScalar(scale);
          clone.position.set(0, -0.45, 20 - i * tileDepth);
          clone.rotation.y = (i % 2) * Math.PI; // alternate so seams don't repeat
          this.modelGroup.add(clone);
        }

        // Real board is in — retire the procedural stand-ins.
        this.proceduralGroup.visible = false;
        const amb = new THREE.AmbientLight(0x35507a, 0.5);
        this.scene.add(amb);
      },
      undefined,
      () => {
        // Missing or failed — keep the procedural scene as the fallback.
        this.modelGroup.visible = false;
      }
    );
  }

  override update({ t, dt, p, pointer }: UpdateArgs): void {
    this.smoothedP += (p - this.smoothedP) * Math.min(1, dt * 5);
    const sp = this.smoothedP;

    const z = 15 - sp * CORRIDOR * 0.9;
    const sway = Math.sin(sp * Math.PI * 3.0) * 8.0 + pointer.nx * 4.0;
    const height = 3.5 + Math.sin(sp * Math.PI * 2.0) * 1.5 + pointer.ny * 1.0;

    this.camera.position.set(sway, height, z);
    this.camera.lookAt(sway * 0.5 + Math.sin(sp * Math.PI * 2.5) * 2.0, height * 0.6, z - 50);

    this.boardMat.uniforms.uTime.value = t;
    this.boardMat.uniforms.uCam.value.copy(this.camera.position);
    if (this.pcbTex) this.boardMat.uniforms.uPcbTex.value = this.pcbTex;

    (this.glowParticles.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    (this.sparkParticles.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
  }
}
