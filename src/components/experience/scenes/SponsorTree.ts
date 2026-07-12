import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';

const TIER_COLORS: Record<string, number> = {
  Partner: 0x6fa8d6,
  Gold: 0xe6b54a,
  Silver: 0xa0aec0,
  Bronze: 0xbd8550,
  'In-Kind': 0x5a7a8a,
};

interface TierDef {
  label: string
  count: number
  radius: number
  startY: number
  color: number
  cardW: number
  cardH: number
  cardD: number
}

const TIERS: TierDef[] = [
  { label: 'Partner', count: 2, radius: 2.0, startY: 8.0, color: 0x6fa8d6, cardW: 3.2, cardH: 1.8, cardD: 0.12 },
  { label: 'Gold', count: 3, radius: 3.0, startY: 5.5, color: 0xe6b54a, cardW: 2.8, cardH: 1.6, cardD: 0.10 },
  { label: 'Silver', count: 4, radius: 4.0, startY: 3.0, color: 0xa0aec0, cardW: 2.4, cardH: 1.4, cardD: 0.09 },
  { label: 'Bronze', count: 5, radius: 5.0, startY: 0.5, color: 0xbd8550, cardW: 2.0, cardH: 1.2, cardD: 0.08 },
  { label: 'In-Kind', count: 6, radius: 6.0, startY: -2.5, color: 0x5a7a8a, cardW: 1.6, cardH: 1.0, cardD: 0.06 },
];

export class SponsorTree extends FXScene {
  private treeGroup = new THREE.Group();
  private trunkMat!: THREE.ShaderMaterial;
  private cardMats: THREE.ShaderMaterial[] = [];
  private treeAngle = 0;

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);
    this.camera.far = 500;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 2, 28);

    const isLite = lite;

    // ── Trunk ──────────────────────────────────────────────────
    this.trunkMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vPos;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vPos;
        varying vec2 vUv;
        void main() {
          float grain = fract(sin(vPos.y * 14.0 + vUv.x * 44.0) * 437.0) * 0.05;
          vec3 dark = vec3(0.08, 0.06, 0.03);
          vec3 light = vec3(0.18, 0.12, 0.06);
          float wave = 0.5 + 0.5 * sin(vPos.y * 0.8 + uTime * 0.1);
          vec3 col = mix(dark, light, wave) + grain;
          float edge = abs(vUv.x - 0.5) * 2.0;
          vec3 blue = vec3(0.44, 0.66, 0.84);
          vec3 gold = vec3(0.90, 0.71, 0.29);
          float pulse = 0.5 + 0.5 * sin(uTime * 0.5 + vPos.y);
          col += mix(blue, gold, pulse) * pow(edge, 4.0) * 0.15;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      uniforms: { uTime: { value: 0 } },
    });
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 1.0, 16, 14, 6),
      this.trunkMat
    );
    trunk.position.y = 1;
    trunk.frustumCulled = false;
    this.treeGroup.add(trunk);

    // ── Cards on branches, tier by tier ────────────────────────
    let cardIdx = 0;
    for (const tier of TIERS) {
      for (let ci = 0; ci < tier.count; ci++) {
        const angle = (ci / tier.count) * Math.PI * 2 + tier.label.length * 0.3;
        const y = tier.startY + (ci - (tier.count - 1) / 2) * 0.3;
        const a = angle + cardIdx * 0.05;
        const px = Math.cos(a) * tier.radius;
        const pz = Math.sin(a) * tier.radius;

        // ── Branch arm (curved tube from trunk to card) ────────
        const midR = tier.radius * 0.5;
        const pts = [
          new THREE.Vector3(0, y - 0.3, 0),
          new THREE.Vector3(Math.cos(a) * midR * 0.5, y + 0.1, Math.sin(a) * midR * 0.5),
          new THREE.Vector3(Math.cos(a) * midR, y + 0.2, Math.sin(a) * midR),
          new THREE.Vector3(px, y, pz),
        ];
        const curve = new THREE.CatmullRomCurve3(pts);

        if (!isLite) {
          const branchMat = new THREE.MeshBasicMaterial({
            color: tier.color,
            transparent: true,
            opacity: 0.25,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const branch = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 10, 0.035, 4, false),
            branchMat
          );
          branch.frustumCulled = false;
          this.treeGroup.add(branch);

          // Wire overlay
          const wire = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 10, 0.035, 4, false),
            new THREE.MeshBasicMaterial({
              color: tier.color,
              transparent: true,
              opacity: 0.06,
              wireframe: true,
              depthWrite: false,
            })
          );
          wire.frustumCulled = false;
          this.treeGroup.add(wire);
        }

        // ── Branch tip glow ────────────────────────────────────
        const tipGlow = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 6, 6),
          new THREE.MeshBasicMaterial({
            color: tier.color,
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        tipGlow.position.set(px, y, pz);
        tipGlow.frustumCulled = false;
        this.treeGroup.add(tipGlow);

        // ── 3D Card ────────────────────────────────────────────
        const cardMat = new THREE.ShaderMaterial({
          vertexShader: `
            varying vec2 vUv;
            varying vec3 vNormal;
            void main() {
              vUv = uv;
              vNormal = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform vec3 uColor;
            uniform float uTime;
            uniform float uOffset;
            varying vec2 vUv;
            varying vec3 vNormal;

            void main() {
              vec3 edge = uColor;

              // Bevel border on front face
              float bevel = 0.04;
              float border = smoothstep(0.0, bevel, vUv.x) - smoothstep(1.0 - bevel, 1.0, vUv.x);
              border *= smoothstep(0.0, bevel, vUv.y) - smoothstep(1.0 - bevel, 1.0, vUv.y);

              // Face gradient
              float faceGrad = 0.85 + 0.15 * (1.0 - vUv.y);

              // Pulldown top band
              float band = smoothstep(0.78, 0.86, vUv.y) * 0.15;

              // Always visible edge glow
              float pulse = 0.6 + 0.4 * sin(uTime * 0.5 + uOffset);
              vec3 col = vec3(0.06, 0.05, 0.04);
              col = mix(col, edge * 1.2, border * 0.5);
              col += edge * pulse * 0.05;
              col += edge * band;
              col *= faceGrad;

              // Side faces get darker
              float side = abs(vNormal.x) > 0.5 || abs(vNormal.z) > 0.5 ? 1.0 : 0.0;
              col *= 1.0 - side * 0.5;

              float a = 0.7 + 0.2 * border;
              gl_FragColor = vec4(col, a);
            }
          `,
          uniforms: {
            uColor: { value: new THREE.Color(tier.color) },
            uTime: { value: 0 },
            uOffset: { value: cardIdx * 1.7 },
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        this.cardMats.push(cardMat);

        const cardGeo = new THREE.BoxGeometry(tier.cardW, tier.cardH, tier.cardD);
        const card = new THREE.Mesh(cardGeo, cardMat);
        card.position.set(px, y, pz);
        // Face card outward from trunk
        card.lookAt(px * 2, y, pz * 2);
        card.frustumCulled = false;
        this.treeGroup.add(card);

        // ── Backplate (slightly larger, behind card) ──────────
        const backMat = new THREE.MeshBasicMaterial({
          color: tier.color,
          transparent: true,
          opacity: 0.04,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const back = new THREE.Mesh(
          new THREE.BoxGeometry(tier.cardW * 1.08, tier.cardH * 1.08, tier.cardD * 0.5),
          backMat
        );
        back.position.set(px, y, pz);
        back.lookAt(px * 2, y, pz * 2);
        back.frustumCulled = false;
        this.treeGroup.add(back);

        // ── Canvas label ───────────────────────────────────────
        if (!isLite) {
          const canvas = document.createElement('canvas');
          canvas.width = 512;
          canvas.height = 256;
          const ctx = canvas.getContext('2d')!;
          ctx.clearRect(0, 0, 512, 256);

          const hex = '#' + tier.color.toString(16).padStart(6, '0');

          ctx.fillStyle = hex;
          ctx.font = 'bold 22px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(tier.label.toUpperCase(), 24, 36);

          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.font = '12px monospace';
          ctx.fillText('SLOT ' + (cardIdx + 1).toString().padStart(2, '0'), 24, 56);

          ctx.strokeStyle = hex;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.25;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(24, 70);
          ctx.lineTo(488, 70);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;

          ctx.fillStyle = 'rgba(255,255,255,0.03)';
          ctx.fillRect(24, 90, 464, 100);
          ctx.strokeStyle = 'rgba(255,255,255,0.05)';
          ctx.lineWidth = 1;
          ctx.strokeRect(24, 90, 464, 100);
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.font = '18px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('YOUR LOGO', 256, 154);

          ctx.fillStyle = hex;
          ctx.globalAlpha = 0.15;
          ctx.fillRect(24, 210, 464, 3);
          ctx.globalAlpha = 1;

          const labelTex = new THREE.CanvasTexture(canvas);
          labelTex.needsUpdate = true;
          const labelMat = new THREE.MeshBasicMaterial({
            map: labelTex,
            transparent: true,
            depthWrite: false,
            opacity: 0.6,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          });
          const label = new THREE.Mesh(
            new THREE.PlaneGeometry(tier.cardW * 0.8, tier.cardH * 0.55),
            labelMat
          );
          label.position.set(px, y, pz);
          // Slightly forward of card face
          const norm = new THREE.Vector3(px, 0, pz).normalize();
          label.position.addScaledVector(norm, 0.07);
          label.lookAt(px * 2, y, pz * 2);
          label.frustumCulled = false;
          this.treeGroup.add(label);
        }

        cardIdx++;
      }
    }

    // ── Floating particles ─────────────────────────────────────
    const pCount = isLite ? 200 : 700;
    const pGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(pCount * 3);
    const seeds = new Float32Array(pCount);
    for (let i = 0; i < pCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 8;
      const y = -4 + Math.random() * 16;
      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(theta) * r;
      seeds[i] = Math.random();
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));

    const particles = new THREE.Points(
      pGeo,
      new THREE.ShaderMaterial({
        vertexShader: `
          attribute float seed;
          uniform float uTime;
          varying float vSeed;
          void main() {
            vSeed = seed;
            vec3 p = position;
            p.y += sin(uTime * 0.2 + seed * 6.28 + position.x * 0.3) * 0.5;
            p.x += sin(uTime * 0.15 + seed * 4.2) * 0.3;
            p.z += cos(uTime * 0.18 + seed * 5.1) * 0.3;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (1.5 + seed * 3.0) * (80.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
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
            float twinkle = 0.5 + 0.5 * sin(uTime * 1.5 + vSeed * 100.0);
            gl_FragColor = vec4(col, a * 0.35 * twinkle);
          }
        `,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    particles.frustumCulled = false;
    this.treeGroup.add(particles);

    this.scene.add(this.treeGroup);

    // Lights
    const hemi = new THREE.HemisphereLight(0x6fa8d6, 0x1b5e20, 0.6);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xf7d98c, 0.3);
    dir.position.set(10, 20, 10);
    this.scene.add(dir);
  }

  override update({ t, dt, p, pointer }: UpdateArgs): void {
    // Auto-rotate the tree slowly
    this.treeAngle += dt * 0.15;
    this.treeGroup.rotation.y = this.treeAngle + pointer.nx * 0.2;

    // Slight tilt with pointer
    this.treeGroup.rotation.x = pointer.ny * -0.05;

    // Camera arcs around
    const sp = p;
    const radius = 24 + pointer.ny * 1.5;
    const height = 2 + sp * 8 + Math.sin(sp * Math.PI * 2) * 1.0;
    const camAngle = sp * Math.PI * 2.0 + pointer.nx * 0.2;
    this.camera.position.set(
      Math.cos(camAngle) * radius,
      height,
      Math.sin(camAngle) * radius
    );
    this.camera.lookAt(0, height * 0.3 + 1.5, 0);

    // Animate trunk
    this.trunkMat.uniforms.uTime.value = t;

    // Animate card materials
    for (const m of this.cardMats) {
      m.uniforms.uTime.value = t;
    }
  }
}
