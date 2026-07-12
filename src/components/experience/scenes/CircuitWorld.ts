import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';
import pcbVert from '../shaders/pcb.vert.glsl';
import pcbFrag from '../shaders/pcb.frag.glsl';

const CORRIDOR = 600;
const BOARD_W = 300;
const BOARD_D = 900;

function generatePCBTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1B5E20';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(27, 94, 32, 0.3)';
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      if ((Math.floor(x / 3) + Math.floor(y / 3)) % 2 === 0) {
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  ctx.fillStyle = 'rgba(46, 125, 50, 0.25)';
  ctx.fillRect(0, 0, W, H);

  // Traces running along corridor direction (vertical in texture)
  ctx.strokeStyle = '#B87333';
  ctx.lineWidth = 2;
  for (let i = 0; i < 80; i++) {
    const x = 20 + Math.random() * (W - 40);
    const y1 = Math.random() * H;
    const y2 = y1 + 40 + Math.random() * 200;
    ctx.globalAlpha = 0.4 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x + (Math.random() - 0.5) * 20, y1 + (y2 - y1) * 0.5);
    ctx.lineTo(x + (Math.random() - 0.5) * 20, y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Gold pads
  for (let i = 0; i < 120; i++) {
    const x = 30 + Math.random() * (W - 60);
    const y = 30 + Math.random() * (H - 60);
    ctx.fillStyle = '#F5D061';
    ctx.beginPath();
    ctx.arc(x, y, 3 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Silkscreen labels along corridor
  ctx.fillStyle = '#F5F5F0';
  ctx.font = '12px monospace';
  const labels = ['GND', 'VCC', '3.3V', 'SIG', 'CLK', 'DATA', 'RST', 'RX', 'TX', 'PWR'];
  for (let i = 0; i < 40; i++) {
    const x = 10 + Math.random() * (W - 60);
    const y = 20 + Math.random() * (H - 40);
    ctx.globalAlpha = 0.2 + Math.random() * 0.3;
    ctx.fillText(labels[Math.floor(Math.random() * labels.length)]!, x, y);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 4;
  return tex;
}

export class CircuitWorld extends FXScene {
  private boardMat!: THREE.ShaderMaterial;
  private pcbTex!: THREE.CanvasTexture;
  private chips: THREE.Mesh[] = [];
  private caps: THREE.Mesh[] = [];
  private towers: THREE.Mesh[] = [];
  private sparkParticles!: THREE.Points;
  private glowParticles!: THREE.Points;
  private smoothedP = 0;

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);
    this.camera.far = 800;
    this.camera.updateProjectionMatrix();

    this.pcbTex = generatePCBTexture();

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

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    // ── Chip towers (tall QFP-like blocks along corridor) ────
    const towerCount = lite ? 20 : 60;
    const chipMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f16,
      metalness: 0.3,
      roughness: 0.6,
    });
    const pinMat = new THREE.MeshBasicMaterial({ color: 0xf5d061 });
    for (let i = 0; i < towerCount; i++) {
      const x = rnd(-BOARD_W * 0.4, BOARD_W * 0.4);
      const z = rnd(-CORRIDOR + 50, -50);
      const w = rnd(1.5, 4.0);
      const d = rnd(1.5, 4.0);
      const h = rnd(0.3, 2.0);

      const chip = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        chipMat
      );
      chip.position.set(x, h / 2, z);
      chip.castShadow = false;
      this.scene.add(chip);
      this.chips.push(chip);

      // Gold pins on sides
      const pinCount = Math.floor((w + d) * 2);
      for (let pi = 0; pi < pinCount; pi++) {
        const side = pi % 4;
        const pin = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, h * 0.6, 0.15),
          pinMat
        );
        pin.position.set(x, h * 0.5, z);
        if (side === 0) pin.position.x += w / 2 + 0.03;
        else if (side === 1) pin.position.x -= w / 2 + 0.03;
        else if (side === 2) pin.position.z += d / 2 + 0.03;
        else pin.position.z -= d / 2 + 0.03;
        this.scene.add(pin);
      }
    }

    // ── Tall connector towers (you fly between these) ────────
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.6,
      roughness: 0.3,
    });
    for (let i = 0; i < (lite ? 12 : 35); i++) {
      const x = rnd(-BOARD_W * 0.4, BOARD_W * 0.4);
      const z = rnd(-CORRIDOR + 80, -60);
      const h = rnd(3.0, 8.0);
      const w = rnd(0.4, 0.8);

      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, w),
        towerMat
      );
      tower.position.set(x, h / 2 - 0.5, z);
      this.scene.add(tower);
      this.towers.push(tower);

      // Gold tip
      const tip = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.2, 0.08, w * 1.2),
        new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 })
      );
      tip.position.set(x, h - 0.5, z);
      this.scene.add(tip);
    }

    // ── Capacitor clusters ────────────────────────────────────
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x9c6a3a,
      metalness: 0.3,
      roughness: 0.6,
    });
    for (let i = 0; i < (lite ? 30 : 100); i++) {
      const x = rnd(-BOARD_W * 0.4, BOARD_W * 0.4);
      const z = rnd(-CORRIDOR + 50, -30);
      const h = rnd(0.8, 2.5);
      const r = rnd(0.2, 0.5);

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, h, 10),
        capMat
      );
      cap.position.set(x, h / 2 - 0.5, z);
      this.scene.add(cap);
      this.caps.push(cap);

      // Polarity stripe
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(r * 0.15, h * 0.5),
        new THREE.MeshBasicMaterial({ color: 0xf5f5f0, transparent: true, opacity: 0.6 })
      );
      stripe.position.set(x + r + 0.01, h / 2 - 0.5, z);
      stripe.rotation.y = Math.PI / 2;
      this.scene.add(stripe);
    }

    // ── Glow / LED particles lining the corridor ──────────────
    const glowCount = lite ? 200 : 700;
    const glowGeo = new THREE.BufferGeometry();
    const glowPos = new Float32Array(glowCount * 3);
    const glowCol = new Float32Array(glowCount * 3);
    const glowSeed = new Float32Array(glowCount);
    for (let i = 0; i < glowCount; i++) {
      glowPos[i * 3] = rnd(-BOARD_W * 0.45, BOARD_W * 0.45);
      glowPos[i * 3 + 1] = rnd(0.1, 1.5);
      glowPos[i * 3 + 2] = rnd(-CORRIDOR + 30, -10);
      const c = new THREE.Color(
        Math.random() < 0.4 ? 0x6fa8d6 : Math.random() < 0.6 ? 0xe6b54a : 0xbd8550
      );
      glowCol[i * 3] = c.r;
      glowCol[i * 3 + 1] = c.g;
      glowCol[i * 3 + 2] = c.b;
      glowSeed[i] = Math.random();
    }
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
    glowGeo.setAttribute('color', new THREE.BufferAttribute(glowCol, 3));
    glowGeo.setAttribute('seed', new THREE.BufferAttribute(glowSeed, 1));
    this.glowParticles = new THREE.Points(
      glowGeo,
      new THREE.ShaderMaterial({
        vertexShader: `
          attribute vec3 color;
          attribute float seed;
          uniform float uTime;
          varying vec3 vCol;
          varying float vSeed;
          void main() {
            vCol = color;
            vSeed = seed;
            vec3 p = position;
            p.y += sin(uTime * 0.8 + seed * 10.0) * 0.2;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (2.0 + seed * 4.0) * (40.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          varying vec3 vCol;
          varying float vSeed;
          uniform float uTime;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            float a = smoothstep(0.5, 0.0, d);
            float pulse = 0.5 + 0.5 * sin(uTime * 1.2 + vSeed * 60.0);
            gl_FragColor = vec4(vCol, a * 0.5 * pulse);
          }
        `,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.glowParticles.frustumCulled = false;
    this.scene.add(this.glowParticles);

    // ── Spark particles (data flow along corridor) ────────────
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
    this.sparkParticles = new THREE.Points(
      sparkGeo,
      new THREE.ShaderMaterial({
        vertexShader: `
          attribute float speed;
          uniform float uTime;
          uniform float uDt;
          varying float vAlpha;
          void main() {
            vec3 p = position;
            float t = mod(uTime * 0.3 + speed * 0.01, 1.0);
            p.z = mix(-CORRIDOR + 20.0, -10.0, t);
            p.x += sin(uTime * 0.5 + p.z * 0.1) * 2.0;
            vAlpha = sin(t * 3.14);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = 2.0 * (30.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(0.90, 0.71, 0.29, a * vAlpha * 0.8);
          }
        `,
        uniforms: { uTime: { value: 0 }, uDt: { value: 0 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.sparkParticles.frustumCulled = false;
    this.scene.add(this.sparkParticles);

    // Hemisphere light
    const hemi = new THREE.HemisphereLight(0x6fa8d6, 0x1b5e20, 0.8);
    this.scene.add(hemi);
    const dirLight = new THREE.DirectionalLight(0xf7d98c, 0.4);
    dirLight.position.set(10, 20, 10);
    this.scene.add(dirLight);

    // Initial camera
    this.camera.position.set(0, 4, 15);
    this.camera.lookAt(0, 1, -20);
  }

  override update({ t, dt, p, pointer }: UpdateArgs): void {
    this.smoothedP += (p - this.smoothedP) * Math.min(1, dt * 5);
    const sp = this.smoothedP;

    // Flythrough corridor camera — you move THROUGH the board
    const z = 15 - sp * CORRIDOR * 0.9;
    const sway = Math.sin(sp * Math.PI * 3.0) * 8.0 + pointer.nx * 4.0;
    const height = 3.5 + Math.sin(sp * Math.PI * 2.0) * 1.5 + pointer.ny * 1.0;
    const lookZ = z - 50;

    this.camera.position.set(sway, height, z);
    this.camera.lookAt(
      sway * 0.5 + Math.sin(sp * Math.PI * 2.5) * 2.0,
      height * 0.6,
      lookZ
    );

    this.boardMat.uniforms.uTime.value = t;
    this.boardMat.uniforms.uCam.value.copy(this.camera.position);
    if (this.pcbTex) this.boardMat.uniforms.uPcbTex.value = this.pcbTex;

    // Animate glow particles
    (this.glowParticles.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

    // Animate sparks
    const sparkMat = this.sparkParticles.material as THREE.ShaderMaterial;
    sparkMat.uniforms.uTime.value = t;
    sparkMat.uniforms.uDt.value = dt;
  }
}
