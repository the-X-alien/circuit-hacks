import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';
import pcbVert from '../shaders/pcb.vert.glsl';
import pcbFrag from '../shaders/pcb.frag.glsl';

/** Length of the flythrough corridor along −Z. */
const CORRIDOR = 520;
const BOARD_W = 48;
const BOARD_D = CORRIDOR + 80;

const GOLD = 0xd4af37;
const COPPER = 0xb87333;
const FR4 = 0x1a5c2e;
const CHIP_BODY = 0x0c1018;
const SILK = 0xe8e4d8;

function seeded(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Dense, layered FR4 texture: mask, copper, pads, silk, vias. */
function generatePCBTexture(): THREE.CanvasTexture {
  const W = 1536;
  const H = 3072;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // FR4 base
  ctx.fillStyle = '#164a28';
  ctx.fillRect(0, 0, W, H);

  // Fiberglass weave
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      const n = seeded(x * 0.07 + y * 0.11);
      if (n > 0.55) {
        ctx.fillStyle = `rgba(22, 90, 42, ${0.15 + n * 0.2})`;
        ctx.fillRect(x, y, 3, 3);
      }
    }
  }

  // Ground pour hatch
  ctx.strokeStyle = 'rgba(184, 115, 51, 0.12)';
  ctx.lineWidth = 1;
  for (let i = -H; i < W + H; i += 14) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, H);
    ctx.lineTo(i + H, 0);
    ctx.stroke();
  }

  // Horizontal power rails
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
  ctx.lineWidth = 5;
  for (let y = 40; y < H; y += 96) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Vertical signal buses with jogs
  for (let i = 0; i < 90; i++) {
    const x0 = 16 + seeded(i * 3.1) * (W - 32);
    let y = seeded(i * 7.7) * H;
    const segs = 4 + Math.floor(seeded(i * 2.2) * 10);
    ctx.strokeStyle = `rgba(184, 115, 51, ${0.35 + seeded(i) * 0.45})`;
    ctx.lineWidth = 1.2 + seeded(i + 1) * 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y);
    let x = x0;
    for (let s = 0; s < segs; s++) {
      const jog = (seeded(i * 11 + s) - 0.5) * 48;
      const dy = 18 + seeded(i * 13 + s) * 70;
      x = Math.max(8, Math.min(W - 8, x + jog));
      y = Math.min(H - 8, y + dy);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Orthogonal bus bundles
  ctx.lineWidth = 1.5;
  for (let b = 0; b < 18; b++) {
    const bx = 40 + b * 80 + seeded(b) * 20;
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
    for (let t = 0; t < 5; t++) {
      ctx.beginPath();
      ctx.moveTo(bx + t * 3, 0);
      ctx.lineTo(bx + t * 3 + (seeded(b + t) - 0.5) * 12, H);
      ctx.stroke();
    }
  }

  // SMD pads + vias
  for (let i = 0; i < 420; i++) {
    const x = 12 + seeded(i * 1.7) * (W - 24);
    const y = 12 + seeded(i * 2.9) * (H - 24);
    const r = 2 + seeded(i * 4.1) * 5;
    // via annulus
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a1a10';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // IC footprints (QFP pads)
  for (let i = 0; i < 55; i++) {
    const cx = 60 + seeded(i * 5.5) * (W - 120);
    const cy = 60 + seeded(i * 8.1) * (H - 120);
    const pins = 4 + Math.floor(seeded(i * 3) * 8);
    const pitch = 6;
    const body = pins * pitch * 0.55;
    ctx.fillStyle = 'rgba(12, 16, 24, 0.55)';
    ctx.fillRect(cx - body / 2, cy - body / 2, body, body);
    ctx.fillStyle = '#e0b84a';
    for (let p = 0; p < pins; p++) {
      const o = -((pins - 1) * pitch) / 2 + p * pitch;
      ctx.fillRect(cx + o - 1.2, cy - body / 2 - 7, 2.4, 7);
      ctx.fillRect(cx + o - 1.2, cy + body / 2, 2.4, 7);
      ctx.fillRect(cx - body / 2 - 7, cy + o - 1.2, 7, 2.4);
      ctx.fillRect(cx + body / 2, cy + o - 1.2, 7, 2.4);
    }
  }

  // Silkscreen reference designators
  ctx.fillStyle = 'rgba(240, 236, 220, 0.55)';
  ctx.font = 'bold 14px monospace';
  const labels = [
    'U1', 'U2', 'U3', 'R12', 'C44', 'L3', 'J1', 'XTAL',
    '3V3', 'GND', 'VBUS', 'SDA', 'SCL', 'TX', 'RX', 'PWM',
    'ESP32', 'ATmega', 'MOSFET', 'USB-C', 'I2C', 'SPI',
  ];
  for (let i = 0; i < 90; i++) {
    const x = 10 + seeded(i * 9.3) * (W - 80);
    const y = 18 + seeded(i * 6.7) * (H - 30);
    ctx.globalAlpha = 0.25 + seeded(i) * 0.4;
    ctx.fillText(labels[Math.floor(seeded(i * 2) * labels.length)]!, x, y);
  }
  ctx.globalAlpha = 1;

  // Edge connector gold fingers
  ctx.fillStyle = '#d4af37';
  for (let i = 0; i < 40; i++) {
    const x = 40 + i * ((W - 80) / 40);
    ctx.fillRect(x, H - 28, 8, 24);
    ctx.fillRect(x, 4, 8, 24);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeChip(
  w: number,
  d: number,
  h: number,
  pinsPerSide: number,
  bodyMat: THREE.Material,
  pinMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
  body.position.y = h / 2;
  g.add(body);

  // Dimple / pin-1 mark
  const mark = new THREE.Mesh(
    new THREE.SphereGeometry(Math.min(w, d) * 0.08, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x1a1a1a })
  );
  mark.position.set(-w * 0.32, h + 0.01, -d * 0.32);
  g.add(mark);

  // Gold heat slug on top of larger chips
  if (w > 1.2) {
    const slug = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.45, 0.02, d * 0.45),
      new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.95, roughness: 0.25 })
    );
    slug.position.y = h + 0.01;
    g.add(slug);
  }

  const pinW = 0.06;
  const pinH = h * 0.55;
  const pinL = 0.22;
  const placePin = (x: number, z: number, rotY: number) => {
    const pin = new THREE.Mesh(new THREE.BoxGeometry(pinW, pinH, pinL), pinMat);
    pin.position.set(x, pinH * 0.45, z);
    pin.rotation.y = rotY;
    g.add(pin);
  };

  for (let i = 0; i < pinsPerSide; i++) {
    const t = pinsPerSide === 1 ? 0 : i / (pinsPerSide - 1);
    const ox = (t - 0.5) * (w - 0.2);
    const oz = (t - 0.5) * (d - 0.2);
    placePin(ox, d / 2 + pinL / 2, 0);
    placePin(ox, -d / 2 - pinL / 2, 0);
    placePin(w / 2 + pinL / 2, oz, Math.PI / 2);
    placePin(-w / 2 - pinL / 2, oz, Math.PI / 2);
  }
  return g;
}

export class CircuitWorld extends FXScene {
  private boardMat!: THREE.ShaderMaterial;
  private pcbTex!: THREE.CanvasTexture;
  private world = new THREE.Group();
  private signalSparks!: THREE.Points;
  private leds!: THREE.Points;
  private smoothedP = 0;

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);
    this.camera.far = 900;
    this.camera.fov = 55;
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
      new THREE.PlaneGeometry(BOARD_W, BOARD_D, 1, 1),
      this.boardMat
    );
    board.rotation.x = -Math.PI / 2;
    board.position.set(0, 0, -CORRIDOR / 2);
    this.world.add(board);

    // Board thickness edge (visible FR4 side)
    const edgeMat = new THREE.MeshStandardMaterial({
      color: FR4,
      roughness: 0.85,
      metalness: 0.05,
    });
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_W + 0.4, 0.35, BOARD_D + 0.4),
      edgeMat
    );
    edge.position.set(0, -0.18, -CORRIDOR / 2);
    this.world.add(edge);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: CHIP_BODY,
      metalness: 0.35,
      roughness: 0.55,
    });
    const pinMat = new THREE.MeshStandardMaterial({
      color: GOLD,
      metalness: 0.95,
      roughness: 0.22,
    });
    const copperMat = new THREE.MeshStandardMaterial({
      color: COPPER,
      metalness: 0.85,
      roughness: 0.35,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x3a2a18,
      metalness: 0.4,
      roughness: 0.45,
    });
    const blueCapMat = new THREE.MeshStandardMaterial({
      color: 0x1a3a6a,
      metalness: 0.25,
      roughness: 0.5,
    });
    const headerMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.2,
      roughness: 0.7,
    });
    const ledMatOn = new THREE.MeshStandardMaterial({
      color: 0xe6b54a,
      emissive: 0xe6b54a,
      emissiveIntensity: 1.4,
      metalness: 0.1,
      roughness: 0.4,
    });
    const ledMatBlue = new THREE.MeshStandardMaterial({
      color: 0x6fa8d6,
      emissive: 0x6fa8d6,
      emissiveIntensity: 1.2,
      metalness: 0.1,
      roughness: 0.4,
    });

    const rnd = (a: number, b: number, s: number) => a + seeded(s) * (b - a);

    // ── Layout lanes: left bank / center bus / right bank ─────
    const placeAlong = (
      count: number,
      laneX: number,
      zMin: number,
      zMax: number,
      fn: (x: number, z: number, i: number) => void
    ) => {
      for (let i = 0; i < count; i++) {
        const z = zMin + ((zMax - zMin) * (i + 0.5 + (seeded(i + laneX) - 0.5) * 0.4)) / count;
        const x = laneX + (seeded(i * 3.3 + laneX) - 0.5) * 3.2;
        fn(x, z, i);
      }
    };

    // MCU / large QFP towers you fly between
    const largeCount = lite ? 14 : 28;
    placeAlong(largeCount, 0, -CORRIDOR + 40, -20, (x, z, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const px = side * rnd(6, 16, i * 1.1) + (seeded(i) - 0.5) * 2;
      const w = rnd(1.6, 3.4, i * 2.2);
      const d = rnd(1.6, 3.4, i * 3.3);
      const h = rnd(0.45, 1.1, i * 4.4);
      const pins = 6 + Math.floor(seeded(i * 5) * 8);
      const chip = makeChip(w, d, h, pins, bodyMat, pinMat);
      chip.position.set(px, 0.02, z);
      chip.rotation.y = seeded(i * 6) * 0.08;
      this.world.add(chip);

      // Socket / base plate
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.35, 0.08, d + 0.35),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 })
      );
      base.position.set(px, 0.04, z);
      this.world.add(base);
    });

    // Tall pin-header "towers" — fly-between landmarks
    const towerCount = lite ? 18 : 40;
    for (let i = 0; i < towerCount; i++) {
      const x = (seeded(i * 1.9) - 0.5) * BOARD_W * 0.85;
      const z = -30 - seeded(i * 2.7) * (CORRIDOR - 60);
      const rows = 2 + Math.floor(seeded(i) * 2);
      const cols = 6 + Math.floor(seeded(i + 1) * 14);
      const g = new THREE.Group();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const plastic = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.22, 0.18),
            headerMat
          );
          plastic.position.set((c - cols / 2) * 0.22, 0.11, (r - rows / 2) * 0.22);
          g.add(plastic);
          const pinH = rnd(1.2, 3.8, i + c + r);
          const pin = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, pinH, 0.05),
            pinMat
          );
          pin.position.set(
            (c - cols / 2) * 0.22,
            pinH / 2 + 0.2,
            (r - rows / 2) * 0.22
          );
          g.add(pin);
        }
      }
      g.position.set(x, 0, z);
      g.rotation.y = (seeded(i * 4) - 0.5) * 0.4;
      this.world.add(g);
    }

    // Electrolytic capacitors in clusters
    const capCount = lite ? 40 : 110;
    for (let i = 0; i < capCount; i++) {
      const x = (seeded(i * 3.1) - 0.5) * BOARD_W * 0.8;
      const z = -20 - seeded(i * 4.2) * (CORRIDOR - 40);
      const h = rnd(0.6, 2.2, i);
      const r = rnd(0.18, 0.42, i + 1);
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, h, 12),
        seeded(i) > 0.55 ? blueCapMat : capMat
      );
      cap.position.set(x, h / 2 + 0.02, z);
      this.world.add(cap);
      // polarity stripe
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(r * 0.15, h * 0.55, r * 2.05),
        new THREE.MeshBasicMaterial({ color: SILK })
      );
      stripe.position.set(x + r * 0.7, h / 2 + 0.02, z);
      this.world.add(stripe);
      // top vent
      const top = new THREE.Mesh(
        new THREE.CircleGeometry(r * 0.85, 12),
        new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.4 })
      );
      top.rotation.x = -Math.PI / 2;
      top.position.set(x, h + 0.03, z);
      this.world.add(top);
    }

    // Resistor networks (SMD bricks)
    const smdCount = lite ? 50 : 160;
    for (let i = 0; i < smdCount; i++) {
      const x = (seeded(i * 5.5) - 0.5) * BOARD_W * 0.9;
      const z = -15 - seeded(i * 6.1) * (CORRIDOR - 30);
      const w = rnd(0.35, 0.9, i);
      const d = rnd(0.18, 0.35, i + 2);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.12, d),
        new THREE.MeshStandardMaterial({
          color: seeded(i) > 0.5 ? 0x2a1810 : 0x1a1a1a,
          roughness: 0.7,
        })
      );
      body.position.set(x, 0.08, z);
      body.rotation.y = seeded(i * 2) * Math.PI;
      this.world.add(body);
      // end caps
      for (const sx of [-1, 1]) {
        const end = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.13, d),
          copperMat
        );
        end.position.set(x + sx * (w / 2 - 0.02), 0.08, z);
        end.rotation.y = body.rotation.y;
        this.world.add(end);
      }
    }

    // Crystal oscillators
    for (let i = 0; i < (lite ? 8 : 18); i++) {
      const x = (seeded(i * 7.7) - 0.5) * BOARD_W * 0.7;
      const z = -40 - seeded(i * 8.8) * (CORRIDOR - 80);
      const xtal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 0.7, 16),
        new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.9, roughness: 0.25 })
      );
      xtal.rotation.z = Math.PI / 2;
      xtal.position.set(x, 0.35, z);
      this.world.add(xtal);
    }

    // Raised copper traces as thin boxes (visible 3D traces)
    const traceCount = lite ? 40 : 100;
    for (let i = 0; i < traceCount; i++) {
      const x1 = (seeded(i * 1.1) - 0.5) * BOARD_W * 0.85;
      const z1 = -20 - seeded(i * 1.3) * (CORRIDOR - 40);
      const len = rnd(2, 14, i * 2);
      const ang = seeded(i * 3) * Math.PI * 2;
      const trace = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.03, len),
        copperMat
      );
      trace.position.set(x1, 0.02, z1);
      trace.rotation.y = ang;
      this.world.add(trace);
    }

    // Status LEDs
    for (let i = 0; i < (lite ? 20 : 48); i++) {
      const x = (seeded(i * 9.1) - 0.5) * BOARD_W * 0.85;
      const z = -25 - seeded(i * 10.2) * (CORRIDOR - 50);
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.1, 0.28),
        seeded(i) > 0.5 ? ledMatOn : ledMatBlue
      );
      led.position.set(x, 0.08, z);
      this.world.add(led);
    }

    // USB / edge connector blocks near path
    for (let i = 0; i < 6; i++) {
      const z = -60 - i * 80;
      const x = (i % 2 === 0 ? -1 : 1) * 18;
      const conn = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 0.9, 1.4),
        new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.4 })
      );
      conn.position.set(x, 0.45, z);
      this.world.add(conn);
      const tongue = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.12, 0.6),
        pinMat
      );
      tongue.position.set(x, 0.35, z + (x > 0 ? -0.7 : 0.7));
      this.world.add(tongue);
    }

    // Signal spark particles along traces
    const sparkN = lite ? 250 : 700;
    const sPos = new Float32Array(sparkN * 3);
    const sSeed = new Float32Array(sparkN);
    for (let i = 0; i < sparkN; i++) {
      sPos[i * 3] = (seeded(i * 1.01) - 0.5) * BOARD_W * 0.9;
      sPos[i * 3 + 1] = 0.08 + seeded(i * 1.02) * 0.4;
      sPos[i * 3 + 2] = -10 - seeded(i * 1.03) * CORRIDOR;
      sSeed[i] = seeded(i * 1.04);
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sGeo.setAttribute('aSeed', new THREE.BufferAttribute(sSeed, 1));
    this.signalSparks = new THREE.Points(
      sGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime;
          varying float vA;
          void main() {
            vec3 p = position;
            float t = fract(uTime * (0.08 + aSeed * 0.18) + aSeed);
            p.z = mix(-${CORRIDOR.toFixed(1)}, -10.0, t);
            p.x += sin(uTime * 0.7 + aSeed * 40.0) * 0.6;
            vA = sin(t * 3.14159);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (1.8 + aSeed * 2.5) * (50.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            float a = smoothstep(0.5, 0.0, d) * vA;
            gl_FragColor = vec4(0.95, 0.78, 0.35, a * 0.85);
          }
        `,
      })
    );
    this.signalSparks.frustumCulled = false;
    this.world.add(this.signalSparks);

    // Soft LED ambient points
    const ledN = lite ? 120 : 320;
    const lPos = new Float32Array(ledN * 3);
    const lCol = new Float32Array(ledN * 3);
    const lSeed = new Float32Array(ledN);
    for (let i = 0; i < ledN; i++) {
      lPos[i * 3] = (seeded(i * 2.1) - 0.5) * BOARD_W * 0.9;
      lPos[i * 3 + 1] = 0.15 + seeded(i * 2.2) * 1.2;
      lPos[i * 3 + 2] = -15 - seeded(i * 2.3) * CORRIDOR;
      const c = new THREE.Color(
        seeded(i) < 0.4 ? 0xe6b54a : seeded(i + 1) < 0.7 ? 0x6fa8d6 : 0x4ade80
      );
      lCol[i * 3] = c.r;
      lCol[i * 3 + 1] = c.g;
      lCol[i * 3 + 2] = c.b;
      lSeed[i] = seeded(i * 2.4);
    }
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
    lGeo.setAttribute('color', new THREE.BufferAttribute(lCol, 3));
    lGeo.setAttribute('aSeed', new THREE.BufferAttribute(lSeed, 1));
    this.leds = new THREE.Points(
      lGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime;
          varying vec3 vCol;
          varying float vA;
          void main() {
            vCol = color;
            vec3 p = position;
            p.y += sin(uTime * 1.1 + aSeed * 20.0) * 0.12;
            vA = 0.45 + 0.55 * sin(uTime * (1.2 + aSeed) + aSeed * 50.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (2.5 + aSeed * 4.0) * (55.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vCol;
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vCol, a * vA * 0.55);
          }
        `,
      })
    );
    this.leds.frustumCulled = false;
    this.world.add(this.leds);

    this.scene.add(this.world);

    const hemi = new THREE.HemisphereLight(0x8eb8d8, 0x0c1a10, 0.75);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe6a8, 0.85);
    key.position.set(12, 28, 8);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x6fa8d6, 0.25);
    fill.position.set(-18, 10, -20);
    this.scene.add(fill);
    const rim = new THREE.PointLight(0xe6b54a, 0.6, 80);
    rim.position.set(0, 6, -40);
    this.scene.add(rim);

    this.camera.position.set(0, 3.2, 12);
    this.camera.lookAt(0, 0.8, -30);
  }

  override update({ t, dt, p, pointer }: UpdateArgs): void {
    this.smoothedP += (p - this.smoothedP) * Math.min(1, dt * 4.5);
    const sp = this.smoothedP;

    // Fly through the board at chip height, weaving the lanes
    const z = 14 - sp * CORRIDOR * 0.92;
    const lane = Math.sin(sp * Math.PI * 2.4) * 7.5 + pointer.nx * 3.5;
    const height = 2.4 + Math.sin(sp * Math.PI * 1.8) * 1.1 + pointer.ny * 0.7 + sp * 0.4;
    const lookZ = z - 28;

    this.camera.position.set(lane, height, z);
    this.camera.lookAt(
      lane * 0.55 + Math.sin(sp * Math.PI * 3) * 1.5,
      height * 0.45 + 0.3,
      lookZ
    );

    this.boardMat.uniforms.uTime.value = t;
    this.boardMat.uniforms.uCam.value.copy(this.camera.position);
    (this.signalSparks.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    (this.leds.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
  }
}
