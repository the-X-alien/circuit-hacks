import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';

const CARD_COUNT = 18;
const TIER_COLORS = [0x6fa8d6, 0xe6b54a, 0xbd8550];
const TIER_NAMES = ['CORE', 'TITLE', 'COMMUNITY'];

// Card config: name, width, height, distance from pillar, tier color
const tiers = [
  { name: 'TITLE', w: 4.0, h: 2.2, r: 3.8, count: 3 },
  { name: 'CORE', w: 3.2, h: 1.8, r: 3.0, count: 6 },
  { name: 'COMMUNITY', w: 2.4, h: 1.4, r: 2.2, count: 9 },
];

function getTierIndex(i: number): number {
  let acc = 0;
  for (let t = 0; t < tiers.length; t++) {
    acc += tiers[t]!.count;
    if (i < acc) return t;
  }
  return 2;
}

export class SponsorTree extends FXScene {
  private treeMat!: THREE.ShaderMaterial;
  private cards: THREE.Mesh[] = [];
  private labels: { mesh: THREE.Mesh; y: number }[] = [];
  private cardTier: number[] = [];
  private branches!: THREE.LineSegments;
  private particles!: THREE.Points;
  private smoothedP = 0;
  private shimmerParticles!: THREE.Points;

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);
    this.camera.far = 400;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 0, 28);

    // ── Central pillar / spine ────────────────────────────────
    this.treeMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vPos;

        void main() {
          float h = vPos.y * 0.08;
          float pulse = 0.5 + 0.5 * sin(uTime * 0.8 + vPos.y * 0.5);
          float glow = 0.3 + 0.7 * smoothstep(0.7, 0.0, abs(vPos.x) * 6.0);
          vec3 blue  = vec3(0.44, 0.66, 0.84);
          vec3 gold  = vec3(0.90, 0.71, 0.29);
          vec3 bronze = vec3(0.74, 0.52, 0.31);
          float mix1 = 0.5 + 0.5 * sin(h * 2.0 + uTime * 0.3);
          float mix2 = 0.5 + 0.5 * cos(h * 3.0 + uTime * 0.4);
          vec3 col = mix(mix(blue, gold, mix1), bronze, mix2);
          col *= 0.6 + 0.4 * pulse;
          gl_FragColor = vec4(col, 0.35 + 0.15 * glow);
        }
      `,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 28, 24, 1, true),
      this.treeMat
    );
    pillar.position.y = 0;
    pillar.frustumCulled = false;
    this.scene.add(pillar);

    // Core glow tube inside the pillar
    const coreGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 26, 16),
      new THREE.MeshBasicMaterial({
        color: 0x6fa8d6,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    coreGlow.position.y = 0;
    this.scene.add(coreGlow);

    // Ring nodes along the spine
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xe6b54a,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      wireframe: true,
    });
    for (let i = -5; i <= 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.015, 6, 24), ringMat);
      ring.position.y = i * 2.0 + 1.0;
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);
    }

    // ── Sponsor cards ascending the pillar ────────────────────
    // Spread cards from Y=-11 to Y=11 with tier-based spacing
    let cardIndex = 0;
    const isLite = lite;
    for (let ti = 0; ti < tiers.length; ti++) {
      const t = tiers[ti]!;
      for (let ci = 0; ci < t.count; ci++) {
        const frac = ci / Math.max(1, t.count - 1);
        const y = -11 + (frac * 22);
        const angle = cardIndex * 1.15 + Math.random() * 0.15;
        this.cardTier.push(ti);

        // Branch lines from pillar to card
        const branchPoints: number[] = [];
        const segs = 12;
        for (let s = 0; s <= segs; s++) {
          const f = s / segs;
          const bDist = f * t.r;
          const bx = Math.cos(angle) * bDist;
          const bz = Math.sin(angle) * bDist;
          const by = y - 0.35 + f * 0.35;
          branchPoints.push(bx, by, bz);
        }

        if (!lite) {
          const branchGeo = new THREE.BufferGeometry();
          const pts = new Float32Array(branchPoints);
          branchGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
          const branchMesh = new THREE.Line(
            branchGeo,
            new THREE.LineBasicMaterial({
              color: TIER_COLORS[ti],
              transparent: true,
              opacity: 0.08,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            })
          );
          branchMesh.frustumCulled = false;
          this.scene.add(branchMesh);
        }

        const col = new THREE.Color(TIER_COLORS[ti]);
        const cardW = t.w;
        const cardH = t.h;
        const geo = new THREE.PlaneGeometry(cardW, cardH);

        // Backing glow
        const glowMesh = new THREE.Mesh(
          geo,
          new THREE.MeshBasicMaterial({
            color: TIER_COLORS[ti],
            transparent: true,
            opacity: 0.08,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        glowMesh.position.set(Math.cos(angle) * t.r, y, Math.sin(angle) * t.r);
        glowMesh.lookAt(0, y, 0);
        this.scene.add(glowMesh);

        // Card face with text content
        const cardMat = new THREE.ShaderMaterial({
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform vec3 uColor;
            uniform float uTime;
            uniform float uOffset;
            uniform float uTier;
            varying vec2 vUv;

            vec2 transformUv(vec2 uv, float aspect) {
              vec2 c = uv - 0.5;
              c.x *= aspect;
              return c;
            }

            void main() {
              float border = 0.025;
              float b = smoothstep(0.0, border, vUv.x) - smoothstep(1.0 - border, 1.0, vUv.x);
              b *= smoothstep(0.0, border, vUv.y) - smoothstep(1.0 - border, 1.0, vUv.y);

              vec3 bg = vec3(0.06, 0.05, 0.04);
              vec3 edge = uColor;
              float pulse = 0.7 + 0.3 * sin(uTime * 0.6 + uOffset);

              vec3 col = mix(bg, edge * 1.3, b * 0.5);
              col += edge * pulse * 0.04;
              col *= 0.85 + 0.15 * (vUv.x + vUv.y) * 0.5;

              // Tier text area: top band
              float textBand = smoothstep(0.75, 0.85, vUv.y) * 0.15;
              col += edge * textBand * 0.6;

              float a = 0.6 + 0.15 * b;
              gl_FragColor = vec4(col, a);
            }
          `,
          uniforms: {
            uColor: { value: new THREE.Color(TIER_COLORS[ti]) },
            uTime: { value: 0 },
            uOffset: { value: cardIndex * 1.7 },
            uTier: { value: ti },
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const cardMesh = new THREE.Mesh(geo, cardMat);
        cardMesh.position.set(Math.cos(angle) * t.r, y, Math.sin(angle) * t.r);
        cardMesh.lookAt(0, y, 0);
        cardMesh.frustumCulled = false;
        this.scene.add(cardMesh);
        this.cards.push(cardMesh);

        // Create canvas label for each card
        if (!isLite) {
          const canvas = document.createElement('canvas');
          canvas.width = 512;
          canvas.height = 256;
          const ctx = canvas.getContext('2d')!;
          ctx.clearRect(0, 0, 512, 256);

          ctx.fillStyle = '#ffffff';
          ctx.font = '28px monospace';
          ctx.textAlign = 'center';

          const colorHex = '#' + TIER_COLORS[ti]!.toString(16).padStart(6, '0');

          // Tier badge
          ctx.fillStyle = colorHex;
          ctx.font = 'bold 22px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(t.name, 24, 36);
          // Sponsor number
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.font = '12px monospace';
          ctx.fillText('SLOT ' + (cardIndex + 1).toString().padStart(2, '0'), 24, 56);

          // Dashed line separator
          ctx.strokeStyle = colorHex;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.3;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(24, 70);
          ctx.lineTo(488, 70);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;

          // Logo area
          ctx.fillStyle = 'rgba(255,255,255,0.04)';
          ctx.fillRect(24, 90, 464, 100);
          ctx.strokeStyle = 'rgba(255,255,255,0.06)';
          ctx.lineWidth = 1;
          ctx.strokeRect(24, 90, 464, 100);

          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.font = '18px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('YOUR LOGO', 256, 154);

          // Bottom bar
          ctx.fillStyle = colorHex;
          ctx.globalAlpha = 0.2;
          ctx.fillRect(24, 210, 464, 3);
          ctx.globalAlpha = 1;

          const labelTex = new THREE.CanvasTexture(canvas);
          labelTex.needsUpdate = true;
          const labelMat = new THREE.MeshBasicMaterial({
            map: labelTex,
            transparent: true,
            depthWrite: false,
            opacity: 0.75,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          });
          const labelMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(cardW * 0.85, cardH * 0.7),
            labelMat
          );
          labelMesh.position.copy(cardMesh.position);
          labelMesh.position.z += Math.sin(angle) * t.r * -0.02;
          labelMesh.lookAt(0, y, 0);
          labelMesh.frustumCulled = false;
          this.scene.add(labelMesh);
          this.labels.push({ mesh: labelMesh, y });
        }

        cardIndex++;
      }
    }

    // ── Geometric branch connections (wireframe tree canopy) ──
    if (!lite) {
      const branchPositions: number[] = [];
      const branchColors: number[] = [];
      for (let i = 0; i < this.cards.length; i++) {
        for (let j = i + 1; j < this.cards.length; j++) {
          const dist = Math.abs(i - j);
          if (dist > 4) continue;
          // Connect nearby cards at similar heights
          const p1 = this.cards[i]!.position;
          const p2 = this.cards[j]!.position;
          if (Math.abs(p1.y - p2.y) > 5) continue;
          branchPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
          const c = new THREE.Color(TIER_COLORS[this.cardTier[i]!]);
          for (let k = 0; k < 2; k++) {
            branchColors.push(c.r, c.g, c.b);
          }
        }
      }
      if (branchPositions.length > 0) {
        const bGeo = new THREE.BufferGeometry();
        bGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(branchPositions), 3));
        bGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(branchColors), 3));
        this.branches = new THREE.LineSegments(
          bGeo,
          new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.06,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        this.branches.frustumCulled = false;
        this.scene.add(this.branches);
      }
    }

    // ── Shimmer particles (rising sparkles) ───────────────────
    const shCount = lite ? 200 : 600;
    const shGeo = new THREE.BufferGeometry();
    const shPos = new Float32Array(shCount * 3);
    const shSpeed = new Float32Array(shCount);
    const shSeed = new Float32Array(shCount);
    for (let i = 0; i < shCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 5;
      shPos[i * 3] = Math.cos(a) * r;
      shPos[i * 3 + 1] = -13 + Math.random() * 26;
      shPos[i * 3 + 2] = Math.sin(a) * r;
      shSpeed[i] = 0.4 + Math.random() * 1.2;
      shSeed[i] = Math.random();
    }
    shGeo.setAttribute('position', new THREE.BufferAttribute(shPos, 3));
    shGeo.setAttribute('speed', new THREE.BufferAttribute(shSpeed, 1));
    shGeo.setAttribute('seed', new THREE.BufferAttribute(shSeed, 1));

    this.shimmerParticles = new THREE.Points(
      shGeo,
      new THREE.ShaderMaterial({
        vertexShader: `
          attribute float speed;
          attribute float seed;
          uniform float uTime;
          varying float vSeed;
          void main() {
            vSeed = seed;
            vec3 p = position;
            p.y += mod(uTime * speed + seed * 13.0, 20.0) - 10.0;
            p.x += sin(uTime * 0.3 + seed * 7.0) * 0.2;
            p.z += cos(uTime * 0.4 + seed * 5.0) * 0.2;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (1.5 + seed * 2.5) * (80.0 / -mv.z);
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
            float twinkle = 0.3 + 0.7 * sin(uTime * (0.8 + vSeed * 2.0) + vSeed * 100.0);
            vec3 col;
            if (vSeed < 0.33) col = vec3(0.44, 0.66, 0.84);
            else if (vSeed < 0.66) col = vec3(0.90, 0.71, 0.29);
            else col = vec3(0.74, 0.52, 0.31);
            gl_FragColor = vec4(col, a * 0.35 * twinkle);
          }
        `,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.shimmerParticles.frustumCulled = false;
    this.scene.add(this.shimmerParticles);

    // ── Floating particles around the tree ────────────────────
    const pCount = lite ? 400 : 1200;
    const pGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(pCount * 3);
    const sizes = new Float32Array(pCount);
    const seeds = new Float32Array(pCount);
    for (let i = 0; i < pCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 8;
      const y = -12 + Math.random() * 24;
      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(theta) * r;
      sizes[i] = 0.04 + Math.random() * 0.12;
      seeds[i] = Math.random();
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    pGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));

    this.particles = new THREE.Points(
      pGeo,
      new THREE.ShaderMaterial({
        vertexShader: `
          attribute float size;
          attribute float seed;
          uniform float uTime;
          varying float vSeed;
          void main() {
            vSeed = seed;
            vec3 p = position;
            p.y += sin(uTime * 0.2 + seed * 6.28 + position.x * 0.3) * 0.4;
            p.x += sin(uTime * 0.15 + seed * 4.2) * 0.3;
            p.z += cos(uTime * 0.18 + seed * 5.1) * 0.3;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = size * (120.0 / -mv.z);
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
            float hue = vSeed;
            vec3 col;
            if (hue < 0.33) col = vec3(0.44, 0.66, 0.84);
            else if (hue < 0.66) col = vec3(0.90, 0.71, 0.29);
            else col = vec3(0.74, 0.52, 0.31);
            float twinkle = 0.6 + 0.4 * sin(uTime * 1.5 + vSeed * 100.0);
            gl_FragColor = vec4(col, a * 0.5 * twinkle);
          }
        `,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  override update({ t, dt, p, pointer }: UpdateArgs): void {
    this.smoothedP += (p - this.smoothedP) * Math.min(1, dt * 5);
    const sp = this.smoothedP;

    // Orbit camera around the tree — sweeter path
    const angle = sp * Math.PI * 2.4 + pointer.nx * 0.3;
    const radius = 20 + pointer.ny * 2;
    const height = -6 + sp * 12 + Math.sin(sp * Math.PI * 2) * 1.5;
    this.camera.position.set(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius
    );
    this.camera.lookAt(0, height * 0.5 + 0.5, 0);

    // Spin pillar glow
    this.treeMat.uniforms.uTime.value = t;

    // Pulse cards and labels
    for (let i = 0; i < this.cards.length; i++) {
      const mat = this.cards[i]!.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = t;
    }

    // Update shimmer particles
    const sm = this.shimmerParticles.material as THREE.ShaderMaterial;
    sm.uniforms.uTime.value = t;

    // Update particle time
    const pMat = this.particles.material as THREE.ShaderMaterial;
    pMat.uniforms.uTime.value = t;
  }
}
