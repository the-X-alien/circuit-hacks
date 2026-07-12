import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';
import pcbVert from '../shaders/pcb.vert.glsl';
import pcbFrag from '../shaders/pcb.frag.glsl';

const CORRIDOR = 420;
const BOARD_W = 900;
const BOARD_D = 1000;

function generatePCBTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // FR4 substrate
  ctx.fillStyle = '#1B5E20';
  ctx.fillRect(0, 0, W, H);

  // Subtle fiberglass weave
  ctx.fillStyle = 'rgba(27, 94, 32, 0.3)';
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      if ((Math.floor(x / 3) + Math.floor(y / 3)) % 2 === 0) {
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  // Solder mask tint
  ctx.fillStyle = 'rgba(46, 125, 50, 0.25)';
  ctx.fillRect(0, 0, W, H);

  const CX = W / 2;
  const CZ = H / 3;

  // Helper: draw L-shaped copper trace
  function trace(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    w: number,
    color = '#B87333'
  ) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    // L-shape: horizontal then vertical (or vice versa)
    if (Math.random() > 0.5) {
      ctx.lineTo(x2, y1);
      ctx.lineTo(x2, y2);
    } else {
      ctx.lineTo(x1, y2);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Subtle highlight on one side for copper shimmer
    ctx.strokeStyle = 'rgba(184, 115, 51, 0.15)';
    ctx.lineWidth = w * 0.3;
    ctx.beginPath();
    ctx.moveTo(x1 + 1, y1 + 1);
    if (Math.random() > 0.5) {
      ctx.lineTo(x2 + 1, y1 + 1);
      ctx.lineTo(x2 + 1, y2 + 1);
    } else {
      ctx.lineTo(x1 + 1, y2 + 1);
      ctx.lineTo(x2 + 1, y2 + 1);
    }
    ctx.stroke();
  }

  // Helper: draw gold pad
  function goldPad(cx: number, cy: number, w: number, h: number) {
    ctx.fillStyle = '#F5D061';
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 1);
    ctx.fill();
    // highlight
    ctx.fillStyle = 'rgba(255, 255, 220, 0.3)';
    ctx.beginPath();
    ctx.roundRect(cx - w / 2 + 1, cy - h / 2 + 1, w * 0.4, h * 0.3, 1);
    ctx.fill();
  }

  // Helper: gold via
  function via(cx: number, cy: number, r: number) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#F5D061';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#0A0A0A';
    ctx.fill();
  }

  // Helper: silkscreen text
  function silk(text: string, x: number, y: number, size = 14) {
    ctx.fillStyle = '#F5F5F0';
    ctx.font = `${size}px monospace`;
    ctx.fillText(text, x, y);
  }

  // Helper: rectangular pad group (QFP footprint)
  function qfpFootprint(cx: number, cy: number, size: number, pinCount: number) {
    const pitch = size / (pinCount - 1);
    const padW = 2;
    const padH = 8;
    // Top row
    for (let i = 0; i < pinCount; i++) {
      const x = cx - size / 2 + i * pitch;
      goldPad(x, cy - size / 2 - 4, padW, padH);
    }
    // Bottom row
    for (let i = 0; i < pinCount; i++) {
      const x = cx - size / 2 + i * pitch;
      goldPad(x, cy + size / 2 + 4, padW, padH);
    }
    // Left row
    for (let i = 0; i < pinCount; i++) {
      const y = cy - size / 2 + i * pitch;
      goldPad(cx - size / 2 - 4, y, padH, padW);
    }
    // Right row
    for (let i = 0; i < pinCount; i++) {
      const y = cy - size / 2 + i * pitch;
      goldPad(cx + size / 2 + 4, y, padH, padW);
    }
    // Thermal pad in center
    ctx.fillStyle = '#F5D061';
    ctx.fillRect(cx - size * 0.25, cy - size * 0.25, size * 0.5, size * 0.5);
    // Silkscreen outline
    ctx.strokeStyle = '#F5F5F0';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - size / 2 - 3, cy - size / 2 - 3, size + 6, size + 6);
    // Pin-1 dot
    ctx.beginPath();
    ctx.arc(cx - size / 2 - 2, cy - size / 2 - 2, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#F5F5F0';
    ctx.fill();
  }

  // ── Edge connector (gold fingers along bottom edge) ────────
  const fingerCount = 48;
  const fingerPitch = 14;
  const fingerStartX = CX - (fingerCount * fingerPitch) / 2;
  for (let i = 0; i < fingerCount; i++) {
    const fx = fingerStartX + i * fingerPitch;
    ctx.beginPath();
    ctx.moveTo(fx, H - 8);
    ctx.lineTo(fx + 6, H - 8);
    ctx.lineTo(fx + 5, H);
    ctx.lineTo(fx + 1, H);
    ctx.closePath();
    ctx.fillStyle = '#D4AF37';
    ctx.fill();
    // chamfer highlight
    ctx.fillStyle = 'rgba(255, 255, 200, 0.2)';
    ctx.beginPath();
    ctx.moveTo(fx + 1, H - 7);
    ctx.lineTo(fx + 5, H - 7);
    ctx.lineTo(fx + 4, H - 1);
    ctx.lineTo(fx + 2, H - 1);
    ctx.closePath();
    ctx.fill();
  }

  // Silkscreen edge connector label
  silk('J1', CX - 10, H - 20, 16);

  // ── QFP footprints (large ICs) ──────────────────────────────
  const qfpPositions = [
    { x: CX - 160, z: CZ - 80 },
    { x: CX + 140, z: CZ + 60 },
    { x: CX - 100, z: CZ + 200 },
    { x: CX + 60, z: CZ - 160 },
    { x: CX - 50, z: CZ - 240 },
    { x: CX + 160, z: CZ + 240 },
  ];
  for (let qi = 0; qi < qfpPositions.length; qi++) {
    const q = qfpPositions[qi]!;
    qfpFootprint(q.x, q.z - 120, 50, 12);
    silk(`U${qi + 1}`, q.x - 15, q.z - 120 - 20);
  }

  // ── Smaller SOIC footprints ─────────────────────────────────
  const soicPositions = [
    { x: CX + 200, z: CZ - 50 },
    { x: CX - 200, z: CZ + 100 },
    { x: CX + 100, z: CZ - 280 },
    { x: CX - 140, z: CZ + 300 },
    { x: CX + 240, z: CZ - 200 },
  ];
  let chipIndex = qfpPositions.length + 1;
  for (let si = 0; si < soicPositions.length; si++) {
    const s = soicPositions[si]!;
    const scx = s.x;
    const scy = s.z - 120;
    const pitch = 8;
    const count = 8;
    for (let i = 0; i < count; i++) {
      goldPad(scx - ((count - 1) * pitch) / 2 + i * pitch, scy - 10, 3, 6);
      goldPad(scx - ((count - 1) * pitch) / 2 + i * pitch, scy + 10, 3, 6);
    }
    ctx.strokeStyle = '#F5F5F0';
    ctx.lineWidth = 1;
    ctx.strokeRect(scx - 16, scy - 8, 32, 16);
    silk(`U${chipIndex + si}`, scx - 12, scy + 20);
  }

  // ── Dense trace routing ─────────────────────────────────────
  const traceWidth = 2.5;

  // Power distribution traces (thick)
  const powerTraces = [
    { x1: 0, y1: H / 2, x2: CX - 180, y2: CZ + 60 },
    { x1: W, y1: H / 2 - 100, x2: CX + 180, y2: CZ - 80 },
  ];
  for (const t of powerTraces) {
    trace(t.x1, t.y1, t.x2, t.y2, traceWidth * 3, 'rgba(184, 115, 51, 0.5)');
  }

  // Traces between QFPs (signal routing)
  for (let i = 0; i < qfpPositions.length; i++) {
    for (let j = i + 1; j < qfpPositions.length; j++) {
      if (Math.random() > 0.45) continue;
      const a = qfpPositions[i]!;
      const b = qfpPositions[j]!;
      trace(a.x, a.z - 120, b.x, b.z - 120, traceWidth, '#B87333');
    }
  }

  // Traces from QFPs to edge connector
  for (let i = 0; i < Math.min(qfpPositions.length, 20); i++) {
    const q = qfpPositions[i % qfpPositions.length]!;
    const fingerX = fingerStartX + (i * 3) * fingerPitch + 3;
    trace(q.x + 10, q.z - 120 + 10, fingerX, H - 20, traceWidth * 0.8);
  }

  // Random L-shaped data traces
  for (let i = 0; i < 120; i++) {
    const x1 = 40 + Math.random() * (W - 80);
    const y1 = 40 + Math.random() * (H - 80);
    const x2 = 40 + Math.random() * (W - 80);
    const y2 = 40 + Math.random() * (H - 80);
    trace(x1, y1, x2, y2, 1.0 + Math.random() * 1.5, '#B87333');
  }

  // ── Vias scattered around ───────────────────────────────────
  for (let i = 0; i < 160; i++) {
    const vx = 20 + Math.random() * (W - 40);
    const vy = 20 + Math.random() * (H - 40);
    via(vx, vy, 4 + Math.random() * 3);
  }

  // ── SOIC pads (small ICs, 8-pin) ───────────────────────────
  for (let si = 0; si < 12; si++) {
    const scx = 60 + Math.random() * (W - 120);
    const scy = 60 + Math.random() * (H - 120);
    const pitch = 10;
    const count = 4;
    for (let i = 0; i < count; i++) {
      goldPad(scx - ((count - 1) * pitch) / 2 + i * pitch, scy - 6, 3, 8);
      goldPad(scx - ((count - 1) * pitch) / 2 + i * pitch, scy + 6, 3, 8);
    }
    ctx.strokeStyle = '#F5F5F0';
    ctx.lineWidth = 1;
    ctx.strokeRect(scx - 12, scy - 5, 24, 10);
  }

  // ── Capacitor footprints (cylindrical, two pads) ────────────
  for (let ci = 0; ci < 50; ci++) {
    const ccx = 30 + Math.random() * (W - 60);
    const ccy = 30 + Math.random() * (H - 60);
    goldPad(ccx - 5, ccy, 4, 4);
    goldPad(ccx + 5, ccy, 4, 4);
    // Polarity marking (+)
    ctx.fillStyle = '#F5F5F0';
    ctx.font = '10px monospace';
    ctx.fillText('+', ccx - 5, ccy - 8);
  }

  // ── Silkscreen labels scattered ────────────────────────────
  const labels = [
    'GND', 'VCC', '3.3V', '5V', 'RESET', 'SCL', 'SDA',
    'R1', 'R2', 'R3', 'C1', 'C2', 'C3',
    'D1', 'D2', 'LED1', 'LED2',
    'J1', 'J2', 'J3',
    'SIG_IN', 'SIG_OUT',
    'REV 1.0', 'DATE: 2026',
    'ESD WARNING',
    'HIGH SCHOOL HARDWARE',
  ];
  for (const label of labels) {
    const lx = 20 + Math.random() * (W - 100);
    const ly = 20 + Math.random() * (H - 40);
    silk(label, lx, ly, 10 + Math.random() * 6);
  }

  // ── Board outline ───────────────────────────────────────────
  ctx.strokeStyle = '#F5F5F0';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  // Corner mounting holes
  const holes = [[12, 12], [W - 12, 12], [12, H - 12], [W - 12, H - 12]];
  for (const [hx, hy] of holes) {
    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#F5D061';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0A0A0A';
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 4;
  return tex;
}

export class CircuitWorld extends FXScene {
  private boardMat!: THREE.ShaderMaterial;
  private pcbTex!: THREE.CanvasTexture;
  private chips: THREE.InstancedMesh[] = [];
  private caps: THREE.InstancedMesh[] = [];
  private ledMat!: THREE.MeshBasicMaterial;
  private leds!: THREE.InstancedMesh;
  private sparks!: THREE.Points;
  private smoothedP = 0;

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);
    this.camera.far = 600;
    this.camera.updateProjectionMatrix();

    // ── Generate realistic PCB canvas texture ─────────────────
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
    const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_D), this.boardMat);
    board.rotation.x = -Math.PI / 2;
    board.position.z = -CORRIDOR / 2;
    board.position.y = -0.2;
    this.scene.add(board);

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    // Canvas pixel to world coordinate mapping
    const canvasToWorld = (
      cx: number,
      cy: number
    ): { x: number; z: number } => ({
      x: ((cx / 2048) - 0.5) * 900,
      z: ((cy / 2048) - 0.5) * 1000,
    });

    // ── QFP chips (black die + visible pins) ──────────────────
    const chipCanvasPositions = [
      { x: 1024 - 160, y: 683 - 80 },
      { x: 1024 + 140, y: 683 + 60 },
      { x: 1024 - 100, y: 683 + 200 },
      { x: 1024 + 60, y: 683 - 160 },
      { x: 1024 - 50, y: 683 - 240 },
      { x: 1024 + 160, y: 683 + 240 },
    ];
    const chipPositions = chipCanvasPositions.map((c) => canvasToWorld(c.x, c.y));
    const chipCount = lite ? chipPositions.length : chipPositions.length;

    for (let ci = 0; ci < chipCount; ci++) {
      const cp = chipPositions[ci]!;
      const sx = rand(2.0, 3.0);
      const sz = rand(2.0, 3.0);
      const sy = rand(0.4, 0.8);

      // Black die
      const chipMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
          color: 0x0a0f16,
          metalness: 0.2,
          roughness: 0.7,
        }),
        1
      );
      const m = new THREE.Matrix4();
      m.makeScale(sx, sy, sz);
      m.setPosition(cp.x, sy / 2 + 0.1, cp.z - 60);
      chipMesh.setMatrixAt(0, m);
      chipMesh.instanceMatrix.needsUpdate = true;
      chipMesh.frustumCulled = false;
      this.scene.add(chipMesh);
      this.chips.push(chipMesh);

      // Gold lead-frame (pins visible around the die)
      const pinMat = new THREE.MeshBasicMaterial({ color: 0xf5d061 });
      const pinCount = 14;
      const pPitch = 0.5;
      for (let pi = 0; pi < pinCount; pi++) {
        const side = pi % 4;
        const pin = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.02, 0.3),
          pinMat
        );
        const px = cp.x;
        const pz = cp.z - 60;
        if (side === 0) pin.position.set(px - sx / 2 - 0.05, 0.05, pz - sx / 2 + pi * pPitch);
        else if (side === 1) pin.position.set(px + sx / 2 + 0.05, 0.05, pz - sx / 2 + pi * pPitch);
        else if (side === 2) pin.position.set(px - sx / 2 + pi * pPitch, 0.05, pz - sz / 2 - 0.05);
        else pin.position.set(px - sx / 2 + pi * pPitch, 0.05, pz + sz / 2 + 0.05);
        pin.rotation.x = Math.PI / 2;
        this.scene.add(pin);
      }
    }

    // ── Edge connector (gold fingers as 3D geometry) ─────────
    const fingerMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.85,
      roughness: 0.2,
    });
    const fCount = 36;
    const fPitch = 1.2;
    const fStartX = -fCount * fPitch * 0.5;
    for (let fi = 0; fi < fCount; fi++) {
      const finger = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.02, 0.3),
        fingerMat
      );
      finger.position.set(
        fStartX + fi * fPitch + 0.35,
        0.01,
        0.3 + CORRIDOR / 2 - 0.3
      );
      this.scene.add(finger);
    }

    // ── Capacitors (bronze cylinders with markings) ───────────
    const capCount = lite ? 25 : 80;
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x9c6a3a,
      metalness: 0.3,
      roughness: 0.6,
    });
    for (let i = 0; i < capCount; i++) {
      const x = rand(-BOARD_W * 0.4, BOARD_W * 0.4);
      const z = 24 - Math.random() * (CORRIDOR + 120);
      const h = rand(0.6, 1.8);
      const r = rand(0.25, 0.5);

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, h, 14),
        capMat
      );
      body.position.set(x, h / 2 + 0.1, z);
      body.frustumCulled = false;
      this.scene.add(body);
      this.caps.push(body);

      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(r * 0.15, h * 0.6),
        new THREE.MeshBasicMaterial({ color: 0xf5f5f0 })
      );
      stripe.position.set(x + r + 0.01, h / 2 + 0.1, z);
      stripe.rotation.y = Math.PI / 2;
      this.scene.add(stripe);
    }

    // ── LEDs (emissive gold/blue alternating) ─────────────────
    const ledCount = lite ? 30 : 90;
    this.ledMat = new THREE.MeshBasicMaterial({
      color: 0xf7d98c,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.leds = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      this.ledMat,
      ledCount
    );
    for (let i = 0; i < ledCount; i++) {
      const x = rand(-BOARD_W * 0.4, BOARD_W * 0.4);
      const z = 24 - Math.random() * (CORRIDOR + 120);
      const m = new THREE.Matrix4();
      m.makeScale(1, 0.6, 1);
      m.setPosition(x, 0.35, z);
      this.leds.setMatrixAt(i, m);
    }
    this.leds.instanceMatrix.needsUpdate = true;
    this.leds.frustumCulled = false;
    this.scene.add(this.leds);

    // Store reference to blue LED material for dynamic pulsing
    const blueLedMat = new THREE.MeshBasicMaterial({
      color: 0x6fa8d6,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    (this.leds as any).__blueMat = blueLedMat;

    // Alternating blue/gold LEDs
    const blueLeds = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      blueLedMat,
      Math.floor(ledCount / 2)
    );
    for (let i = 0; i < Math.floor(ledCount / 2); i++) {
      const x = rand(-BOARD_W * 0.4, BOARD_W * 0.4);
      const z = 24 - Math.random() * (CORRIDOR + 120);
      const m = new THREE.Matrix4();
      m.makeScale(1, 0.6, 1);
      m.setPosition(x, 0.35, z);
      blueLeds.setMatrixAt(i, m);
    }
    blueLeds.instanceMatrix.needsUpdate = true;
    blueLeds.frustumCulled = false;
    this.scene.add(blueLeds);

    // ── Current sparks ────────────────────────────────────────
    const sparkCount = lite ? 300 : 900;
    const sparkGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(sparkCount * 3);
    for (let i = 0; i < sparkCount; i++) {
      sp[i * 3] = rand(-BOARD_W * 0.4, BOARD_W * 0.4);
      sp[i * 3 + 1] = rand(0.1, 1.0);
      sp[i * 3 + 2] = 24 - Math.random() * (CORRIDOR + 120);
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.sparks = new THREE.Points(
      sparkGeo,
      new THREE.PointsMaterial({
        color: 0xf7d98c,
        size: 0.18,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);

    // ── Data-flow particles (tiny dots zipping along traces) ──
    const dfCount = lite ? 200 : 600;
    const dfGeo = new THREE.BufferGeometry();
    const dfPos = new Float32Array(dfCount * 3);
    const dfSeed = new Float32Array(dfCount);
    for (let i = 0; i < dfCount; i++) {
      dfPos[i * 3] = rand(-BOARD_W * 0.4, BOARD_W * 0.4);
      dfPos[i * 3 + 1] = rand(0.02, 0.08);
      dfPos[i * 3 + 2] = 24 - Math.random() * (CORRIDOR + 120);
      dfSeed[i] = Math.random();
    }
    dfGeo.setAttribute('position', new THREE.BufferAttribute(dfPos, 3));
    dfGeo.setAttribute('seed', new THREE.BufferAttribute(dfSeed, 1));
    this.dataFlowParticles = new THREE.Points(
      dfGeo,
      new THREE.PointsMaterial({
        color: 0x6fa8d6,
        size: 0.06,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    this.dataFlowParticles.frustumCulled = false;
    this.scene.add(this.dataFlowParticles);

    // Ambient hemisphere light
    const hemi = new THREE.HemisphereLight(0x6fa8d6, 0x1b5e20, 0.6);
    this.scene.add(hemi);

    this.camera.position.set(0, 6, 10);
  }

  private dataFlowParticles!: THREE.Points;

  override update({ t, dt, p, pointer }: UpdateArgs): void {
    this.smoothedP += (p - this.smoothedP) * Math.min(1, dt * 5);
    const sp = this.smoothedP;

    // Cinematic camera path with gentle banking
    const z = 10 - sp * CORRIDOR;
    const sway = Math.sin(sp * Math.PI * 2.4) * 3.0 + pointer.nx * 2.0;
    const height = 6 - sp * 4.0 + Math.sin(sp * Math.PI * 1.8) * 0.6;
    const bank = Math.sin(sp * Math.PI * 2.4) * 0.08;
    this.camera.position.set(
      sway,
      height + Math.sin(sp * Math.PI * 4) * 0.4 + pointer.ny * 0.8,
      z
    );
    // Look ahead with bank offset
    const lookX = sway * 0.4 + Math.sin(sp * Math.PI * 2) * 1.2;
    const lookY = height * 0.3;
    const lookZ = z - 35;
    this.camera.lookAt(lookX, lookY, lookZ);
    // Gentle roll bank
    this.camera.rotation.z = bank * 0.5;

    this.boardMat.uniforms.uTime.value = t;
    this.boardMat.uniforms.uCam.value.copy(this.camera.position);
    if (this.pcbTex) this.boardMat.uniforms.uPcbTex.value = this.pcbTex;

    // LED breathing — gold and blue LEDs alternate with complex pattern
    const ledPulse = 0.5 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.2 + Math.sin(t * 0.7) * 0.5));
    this.ledMat.opacity = ledPulse;
    // Also pulse the blue LEDs
    const blueMat = (this.leds as any).__blueMat as THREE.MeshBasicMaterial | undefined;
    if (blueMat) {
      blueMat.opacity = 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.8 + Math.cos(t * 0.5) * 0.7));
    }

    // Sparks drift along +x and wrap with varied speeds
    const pos = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const speed = dt * 12;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += speed * (0.5 + 0.5 * Math.sin(arr[i + 1] * 3.0 + t * 0.5));
      if (arr[i] > BOARD_W * 0.45) arr[i] = -BOARD_W * 0.45;
    }
    pos.needsUpdate = true;

    // Animate data-flow particles
    if (this.dataFlowParticles) {
      const dp = this.dataFlowParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
      const da = dp.array as Float32Array;
      for (let i = 0; i < da.length; i += 3) {
        const idx = i / 3;
        da[i] += dt * (8 + ((idx * 7) % 13) * 0.5) * Math.sign(da[i * 2 + 1] ?? 1);
        if (da[i] > BOARD_W * 0.45) da[i] = -BOARD_W * 0.45;
        if (da[i] < -BOARD_W * 0.45) da[i] = BOARD_W * 0.45;
      }
      dp.needsUpdate = true;
    }
  }
}
