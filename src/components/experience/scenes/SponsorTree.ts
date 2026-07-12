import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';

/**
 * Active Theory–style sponsor tree:
 * a slowly rotating trunk with curved branches; 3D cards sit ON the
 * branches in ascending rings — highest support at the crown.
 *
 * Tiers mirror covehacks.dev:
 *   Partners → Gold → Silver → Bronze → In-Kind
 */

interface TierDef {
  label: string;
  count: number;
  /** radius of the ring from trunk center */
  radius: number;
  /** height of the ring center */
  y: number;
  color: number;
  cardW: number;
  cardH: number;
}

const TIERS: TierDef[] = [
  { label: 'Partners', count: 3, radius: 2.4, y: 9.2, color: 0x6fa8d6, cardW: 2.9, cardH: 1.7 },
  { label: 'Gold', count: 4, radius: 3.6, y: 6.6, color: 0xe6b54a, cardW: 2.5, cardH: 1.5 },
  { label: 'Silver', count: 5, radius: 4.6, y: 3.9, color: 0xb8c4d4, cardW: 2.15, cardH: 1.3 },
  { label: 'Bronze', count: 6, radius: 5.5, y: 1.3, color: 0xbd8550, cardW: 1.85, cardH: 1.15 },
  { label: 'In-Kind', count: 7, radius: 6.4, y: -1.4, color: 0x5a7a8a, cardW: 1.55, cardH: 1.0 },
];

function hexCss(n: number) {
  return '#' + n.toString(16).padStart(6, '0');
}

function makeCardTexture(tier: string, color: number, slot: number): THREE.CanvasTexture {
  const W = 768;
  const H = 448;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const c = hexCss(color);

  // Card face
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#14110c');
  grad.addColorStop(1, '#0c0b09');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Outer rim
  ctx.strokeStyle = c;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  // Inner hairline
  ctx.strokeStyle = 'rgba(241,233,216,0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(22, 22, W - 44, H - 44);

  // Tier pill
  ctx.fillStyle = c;
  ctx.globalAlpha = 0.18;
  ctx.fillRect(36, 36, 200, 40);
  ctx.globalAlpha = 1;
  ctx.fillStyle = c;
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(tier.toUpperCase(), 48, 64);

  // Slot index
  ctx.fillStyle = 'rgba(241,233,216,0.35)';
  ctx.font = '18px monospace';
  ctx.fillText('SLOT ' + String(slot).padStart(2, '0'), 48, 100);

  // Logo placeholder box
  ctx.strokeStyle = c;
  ctx.globalAlpha = 0.45;
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 2;
  ctx.strokeRect(80, 140, W - 160, 180);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(241,233,216,0.22)';
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('YOUR LOGO', W / 2, 245);

  // Bottom accent bar
  ctx.fillStyle = c;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(36, H - 48, W - 72, 4);
  ctx.globalAlpha = 1;

  // Corner ticks
  ctx.strokeStyle = c;
  ctx.lineWidth = 3;
  const tick = 22;
  // TL
  ctx.beginPath();
  ctx.moveTo(10, 10 + tick);
  ctx.lineTo(10, 10);
  ctx.lineTo(10 + tick, 10);
  ctx.stroke();
  // TR
  ctx.beginPath();
  ctx.moveTo(W - 10 - tick, 10);
  ctx.lineTo(W - 10, 10);
  ctx.lineTo(W - 10, 10 + tick);
  ctx.stroke();
  // BL
  ctx.beginPath();
  ctx.moveTo(10, H - 10 - tick);
  ctx.lineTo(10, H - 10);
  ctx.lineTo(10 + tick, H - 10);
  ctx.stroke();
  // BR
  ctx.beginPath();
  ctx.moveTo(W - 10 - tick, H - 10);
  ctx.lineTo(W - 10, H - 10);
  ctx.lineTo(W - 10, H - 10 - tick);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class SponsorTree extends FXScene {
  private tree = new THREE.Group();
  private trunkMat!: THREE.ShaderMaterial;
  private cardMats: THREE.MeshStandardMaterial[] = [];
  private labelMats: THREE.MeshBasicMaterial[] = [];
  private particles!: THREE.Points;
  private treeAngle = 0;
  private cardGroups: THREE.Group[] = [];

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);
    this.camera.far = 400;
    this.camera.fov = 42;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 4, 26);

    // ── Ground disc ──────────────────────────────────────────
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(14, 48),
      new THREE.MeshStandardMaterial({
        color: 0x0a0907,
        roughness: 0.95,
        metalness: 0.05,
        transparent: true,
        opacity: 0.85,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3.2;
    this.tree.add(ground);

    // Concentric rings on ground
    for (let r = 3; r <= 12; r += 3) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.02, r + 0.02, 64),
        new THREE.MeshBasicMaterial({
          color: 0xe6b54a,
          transparent: true,
          opacity: 0.08,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -3.18;
      this.tree.add(ring);
    }

    // ── Trunk (tapered, slightly irregular) ───────────────────
    this.trunkMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec3 p = position;
          // subtle bark undulation
          p.x += sin(p.y * 2.4 + uv.x * 6.28) * 0.04;
          p.z += cos(p.y * 2.1 + uv.x * 6.28) * 0.04;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vPos;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          float grain = fract(sin(vPos.y * 18.0 + vUv.x * 60.0) * 43758.0) * 0.06;
          vec3 dark = vec3(0.07, 0.055, 0.03);
          vec3 mid = vec3(0.16, 0.11, 0.055);
          float wave = 0.5 + 0.5 * sin(vPos.y * 0.9 + uTime * 0.12);
          vec3 col = mix(dark, mid, wave) + grain;

          // vertical sap veins
          float vein = pow(0.5 + 0.5 * sin(vUv.x * 40.0 + vPos.y * 3.0), 8.0);
          vec3 gold = vec3(0.90, 0.71, 0.29);
          vec3 blue = vec3(0.44, 0.66, 0.84);
          float pulse = 0.5 + 0.5 * sin(uTime * 0.55 + vPos.y * 0.6);
          col += mix(blue, gold, pulse) * vein * 0.18;

          // rim light
          float rim = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.5);
          col += gold * rim * 0.12;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      uniforms: { uTime: { value: 0 } },
    });

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.95, 14.5, 20, 12),
      this.trunkMat
    );
    trunk.position.y = 2.0;
    trunk.castShadow = false;
    this.tree.add(trunk);

    // Root flare
    const roots = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.6, 1.2, 16, 1),
      this.trunkMat
    );
    roots.position.y = -4.0;
    this.tree.add(roots);

    // Crown glow sphere
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xe6b54a,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    crown.position.y = 9.8;
    this.tree.add(crown);

    // ── Tier rings + cards ON branches ───────────────────────
    let globalSlot = 1;
    for (const tier of TIERS) {
      // Invisible ring guide (thin glow torus)
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(tier.radius, 0.018, 6, 48),
        new THREE.MeshBasicMaterial({
          color: tier.color,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      torus.rotation.x = Math.PI / 2;
      torus.position.y = tier.y;
      this.tree.add(torus);

      // Tier label floating near ring
      if (!lite) {
        const tCanvas = document.createElement('canvas');
        tCanvas.width = 256;
        tCanvas.height = 64;
        const tctx = tCanvas.getContext('2d')!;
        tctx.fillStyle = hexCss(tier.color);
        tctx.font = 'bold 28px monospace';
        tctx.textAlign = 'center';
        tctx.fillText(tier.label.toUpperCase(), 128, 40);
        const tTex = new THREE.CanvasTexture(tCanvas);
        tTex.colorSpace = THREE.SRGBColorSpace;
        const tLabel = new THREE.Mesh(
          new THREE.PlaneGeometry(1.6, 0.4),
          new THREE.MeshBasicMaterial({
            map: tTex,
            transparent: true,
            depthWrite: false,
            opacity: 0.7,
            side: THREE.DoubleSide,
          })
        );
        tLabel.position.set(0, tier.y + 0.55, -tier.radius * 0.15);
        this.tree.add(tLabel);
      }

      for (let ci = 0; ci < tier.count; ci++) {
        // Even spacing around the ring, with tier-based phase offset
        const phase = (ci / tier.count) * Math.PI * 2 + tier.y * 0.15;
        const px = Math.cos(phase) * tier.radius;
        const pz = Math.sin(phase) * tier.radius;
        // slight vertical stagger so cards don't co-planar clip
        const py = tier.y + Math.sin(ci * 1.7) * 0.18;

        const cardGroup = new THREE.Group();
        cardGroup.position.set(px, py, pz);
        // face outward from trunk
        cardGroup.lookAt(px * 2.2, py, pz * 2.2);

        // Branch: curved tube from trunk to card
        const midR = tier.radius * 0.55;
        const attachY = tier.y - 0.15;
        const pts = [
          new THREE.Vector3(0, attachY, 0),
          new THREE.Vector3(
            Math.cos(phase) * midR * 0.35,
            attachY + 0.35,
            Math.sin(phase) * midR * 0.35
          ),
          new THREE.Vector3(
            Math.cos(phase) * midR,
            py + 0.15,
            Math.sin(phase) * midR
          ),
          new THREE.Vector3(px, py, pz),
        ];
        const curve = new THREE.CatmullRomCurve3(pts);
        const branch = new THREE.Mesh(
          new THREE.TubeGeometry(curve, lite ? 8 : 16, 0.045, 5, false),
          new THREE.MeshStandardMaterial({
            color: 0x2a1e12,
            roughness: 0.7,
            metalness: 0.15,
          })
        );
        this.tree.add(branch);

        // Branch glow wire
        if (!lite) {
          const glowBranch = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 12, 0.02, 4, false),
            new THREE.MeshBasicMaterial({
              color: tier.color,
              transparent: true,
              opacity: 0.28,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            })
          );
          this.tree.add(glowBranch);
        }

        // Joint sphere at tip
        const joint = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 10, 10),
          new THREE.MeshStandardMaterial({
            color: tier.color,
            emissive: tier.color,
            emissiveIntensity: 0.55,
            metalness: 0.4,
            roughness: 0.35,
          })
        );
        joint.position.set(px, py, pz);
        this.tree.add(joint);

        // ── 3D card body ────────────────────────────────────
        const cardDepth = 0.1;
        const cardMat = new THREE.MeshStandardMaterial({
          color: 0x12100c,
          metalness: 0.35,
          roughness: 0.45,
          emissive: tier.color,
          emissiveIntensity: 0.08,
        });
        this.cardMats.push(cardMat);

        const cardMesh = new THREE.Mesh(
          new THREE.BoxGeometry(tier.cardW, tier.cardH, cardDepth),
          cardMat
        );
        cardGroup.add(cardMesh);

        // Colored edge rim (slightly larger frame behind)
        const rim = new THREE.Mesh(
          new THREE.BoxGeometry(tier.cardW + 0.08, tier.cardH + 0.08, cardDepth * 0.5),
          new THREE.MeshBasicMaterial({
            color: tier.color,
            transparent: true,
            opacity: 0.55,
          })
        );
        rim.position.z = -cardDepth * 0.4;
        cardGroup.add(rim);

        // Front face label texture
        const faceTex = makeCardTexture(tier.label, tier.color, globalSlot++);
        const faceMat = new THREE.MeshBasicMaterial({
          map: faceTex,
          transparent: true,
          opacity: 0.95,
          side: THREE.FrontSide,
        });
        this.labelMats.push(faceMat);
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(tier.cardW * 0.96, tier.cardH * 0.96),
          faceMat
        );
        face.position.z = cardDepth / 2 + 0.01;
        cardGroup.add(face);

        // Soft back glow plate
        const backGlow = new THREE.Mesh(
          new THREE.PlaneGeometry(tier.cardW * 1.15, tier.cardH * 1.15),
          new THREE.MeshBasicMaterial({
            color: tier.color,
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        backGlow.position.z = -cardDepth * 0.6;
        cardGroup.add(backGlow);

        this.tree.add(cardGroup);
        this.cardGroups.push(cardGroup);
      }
    }

    // ── Ambient particles orbiting the tree ──────────────────
    const pCount = lite ? 180 : 550;
    const pGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(pCount * 3);
    const seeds = new Float32Array(pCount);
    for (let i = 0; i < pCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 9;
      const y = -3.5 + Math.random() * 15;
      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(theta) * r;
      seeds[i] = Math.random();
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.particles = new THREE.Points(
      pGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime;
          varying float vSeed;
          void main() {
            vSeed = aSeed;
            vec3 p = position;
            float ang = uTime * (0.08 + aSeed * 0.12) + aSeed * 6.28;
            float r = length(p.xz);
            p.x = cos(ang) * r;
            p.z = sin(ang) * r;
            p.y += sin(uTime * 0.35 + aSeed * 12.0) * 0.35;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (1.4 + aSeed * 3.2) * (70.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vSeed;
          uniform float uTime;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            float a = smoothstep(0.5, 0.0, d);
            vec3 col;
            if (vSeed < 0.33) col = vec3(0.44, 0.66, 0.84);
            else if (vSeed < 0.66) col = vec3(0.90, 0.71, 0.29);
            else col = vec3(0.74, 0.52, 0.31);
            float tw = 0.5 + 0.5 * sin(uTime * 1.6 + vSeed * 90.0);
            gl_FragColor = vec4(col, a * 0.4 * tw);
          }
        `,
      })
    );
    this.particles.frustumCulled = false;
    this.tree.add(this.particles);

    this.scene.add(this.tree);

    // Lights
    this.scene.add(new THREE.HemisphereLight(0x6fa8d6, 0x1a1208, 0.55));
    const key = new THREE.DirectionalLight(0xffe6a8, 0.7);
    key.position.set(8, 18, 10);
    this.scene.add(key);
    const fill = new THREE.PointLight(0x6fa8d6, 0.45, 40);
    fill.position.set(-6, 4, 8);
    this.scene.add(fill);
    const warm = new THREE.PointLight(0xe6b54a, 0.55, 30);
    warm.position.set(4, 8, -4);
    this.scene.add(warm);
  }

  override update({ t, dt, p, pointer }: UpdateArgs): void {
    // Continuous slow spin — Active Theory energy
    this.treeAngle += dt * 0.18;
    this.tree.rotation.y = this.treeAngle + pointer.nx * 0.25;
    this.tree.rotation.x = pointer.ny * -0.06;

    // Camera orbits + climbs with scroll progress (ascending tiers)
    const sp = p;
    const radius = 22 - sp * 3 + pointer.ny * 1.2;
    const height = -0.5 + sp * 10.5;
    const camAngle = this.treeAngle * 0.35 + sp * Math.PI * 0.6 + pointer.nx * 0.15;
    this.camera.position.set(
      Math.cos(camAngle) * radius,
      height,
      Math.sin(camAngle) * radius
    );
    this.camera.lookAt(0, height * 0.55 + 1.5, 0);

    this.trunkMat.uniforms.uTime.value = t;
    (this.particles.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

    // Gentle card bob + face camera-ish via lookAt residual
    for (let i = 0; i < this.cardGroups.length; i++) {
      const g = this.cardGroups[i]!;
      g.position.y += Math.sin(t * 0.9 + i * 0.7) * 0.0008;
    }

    // Pulse emissive on cards
    for (let i = 0; i < this.cardMats.length; i++) {
      const m = this.cardMats[i]!;
      m.emissiveIntensity = 0.06 + 0.05 * Math.sin(t * 1.2 + i * 0.4);
    }
  }
}
