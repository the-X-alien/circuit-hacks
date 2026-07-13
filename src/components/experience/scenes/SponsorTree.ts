import * as THREE from 'three';
import { FXScene, type UpdateArgs } from '../FXSceneManager';

// ── Tier system (covehacks.dev order). Rendered as an Active-Theory /work style
// coverflow: one big panel centred and facing you, neighbours flanking and
// receding. Scroll advances through them one-by-one, Partner (top tier) first.
interface TierDef {
  label: string;
  count: number;
  color: number;
  scale: number; // per-tier size — more important tiers are a touch bigger
}

const TIERS: TierDef[] = [
  { label: 'Partner', count: 2, color: 0x8fc3f0, scale: 1.3 }, // biggest — most important
  { label: 'Gold', count: 2, color: 0xe6b54a, scale: 1.12 },
  { label: 'Silver', count: 2, color: 0xc2ccd6, scale: 0.98 },
  { label: 'Bronze', count: 2, color: 0xc98b52, scale: 0.86 },
  { label: 'In-Kind', count: 2, color: 0x7bc48a, scale: 0.74 }, // smallest, distinct green
];

const CARD_W = 8.6;
const CARD_H = 5.4;
const CAM_Z = 21;
const SPACING = 12.0; // horizontal gap between neighbours (keeps them from covering the front)
const DEPTH = 7.0; // how far neighbours recede
const TILT = 0.5; // radians neighbours turn toward the centre
const Y_OFFSET = -2.4; // drop the carousel into the lower viewport, below the intro copy
// Scroll buffer: hold Partner (first) / In-Kind (last) centred well clear of the
// intro copy above and the legend/CTA below, so the end cards are never covered.
const LEAD_IN = 0.2;
const LEAD_OUT = 0.8;

export interface SponsorCardData {
  tier: string;
  colorHex: string;
}

interface CardEntry {
  group: THREE.Group;
  mat: THREE.ShaderMaterial;
  tierScale: number;
}

export class SponsorTree extends FXScene {
  private root = new THREE.Group();
  private cards: CardEntry[] = [];
  private cardMeshes: THREE.Mesh[] = [];
  private coreMat!: THREE.ShaderMaterial;
  private core!: THREE.Mesh;
  private dustMat!: THREE.ShaderMaterial;
  private front = 0;
  private raycaster = new THREE.Raycaster();

  get cardCount(): number {
    return this.cardMeshes.length;
  }

  override init(renderer: THREE.WebGLRenderer, lite: boolean): void {
    super.init(renderer, lite);
    this.camera.fov = 42;
    this.camera.far = 300;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 0, CAM_Z);
    this.camera.lookAt(0, 0, 0);

    // ── Central glowing sculpture, set well back behind the cards ──
    this.coreMat = new THREE.ShaderMaterial({
      vertexShader: `
        uniform float uTime; varying vec3 vN; varying vec3 vPos;
        void main(){
          vN = normal; vec3 p = position;
          p += normal * sin(p.x*1.3 + uTime) * cos(p.y*1.2 + uTime*0.8) * 0.5;
          vPos = p;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime; varying vec3 vN; varying vec3 vPos;
        void main(){
          float f = 0.5 + 0.5*sin(vPos.y*0.5 + uTime);
          vec3 col = mix(vec3(0.42,0.72,0.98), vec3(1.0,0.78,0.34), f);
          float fres = pow(1.0 - abs(dot(normalize(vN), vec3(0.0,0.0,1.0))), 2.0);
          gl_FragColor = vec4(col*(0.15 + fres*1.1), 0.35 + fres*0.4);
        }
      `,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(4.0, lite ? 2 : 4), this.coreMat);
    this.core.position.set(0, Y_OFFSET, -16);
    this.core.frustumCulled = false;
    this.root.add(this.core);

    // ── Build the cards, ordered Partner → In-Kind ─────────────
    TIERS.forEach((tier) => {
      const colorHex = '#' + tier.color.toString(16).padStart(6, '0');
      for (let i = 0; i < tier.count; i++) {
        const g = new THREE.Group();

        const frame = new THREE.Mesh(
          this.roundedPlane(CARD_W * 1.045, CARD_H * 1.045, 0.5),
          new THREE.MeshBasicMaterial({
            color: tier.color,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        frame.position.z = -0.05;
        frame.frustumCulled = false;
        g.add(frame);

        const tex = this.makeCardTexture(tier);
        const mat = new THREE.ShaderMaterial({
          vertexShader: `
            varying vec2 vUv;
            void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
          `,
          fragmentShader: `
            uniform sampler2D uTex; uniform vec3 uColor; uniform float uTime; uniform float uFocus;
            varying vec2 vUv;
            void main(){
              vec3 glass = mix(vec3(0.11,0.12,0.14), vec3(0.05,0.055,0.065), vUv.y);
              float centerGlow = smoothstep(0.85,0.0,distance(vUv,vec2(0.5))) * (0.10 + uFocus*0.12);
              vec3 col = glass + uColor*centerGlow;
              vec4 lab = texture2D(uTex, vUv);
              col = mix(col, lab.rgb, lab.a);
              float edge = min(min(vUv.x,1.0-vUv.x), min(vUv.y,1.0-vUv.y));
              float rim = smoothstep(0.045,0.0,edge);
              col += uColor * rim * (0.8 + uFocus*0.8);
              gl_FragColor = vec4(col, 0.99);
            }
          `,
          uniforms: {
            uTex: { value: tex },
            uColor: { value: new THREE.Color(tier.color) },
            uTime: { value: 0 },
            uFocus: { value: 0 },
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const panel = new THREE.Mesh(this.roundedPlane(CARD_W, CARD_H, 0.5), mat);
        panel.frustumCulled = false;
        panel.userData = { sponsor: { tier: tier.label, colorHex } as SponsorCardData };
        g.add(panel);
        this.cardMeshes.push(panel);

        this.root.add(g);
        this.cards.push({ group: g, mat, tierScale: tier.scale });
      }
    });

    // ── Sparse dust ────────────────────────────────────────────
    const dCount = lite ? 80 : 240;
    const dGeo = new THREE.BufferGeometry();
    const dPos = new Float32Array(dCount * 3);
    const dSeed = new Float32Array(dCount);
    for (let i = 0; i < dCount; i++) {
      dPos[i * 3] = (Math.random() - 0.5) * 40;
      dPos[i * 3 + 1] = (Math.random() - 0.5) * 24;
      dPos[i * 3 + 2] = -2 - Math.random() * 20;
      dSeed[i] = Math.random();
    }
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dGeo.setAttribute('seed', new THREE.BufferAttribute(dSeed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float seed; uniform float uTime; varying float vSeed;
        void main(){
          vSeed = seed; vec3 p = position;
          p.y += sin(uTime*0.2 + seed*6.28)*0.6;
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          gl_PointSize = (1.0 + seed*2.0) * (70.0/-mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vSeed; uniform float uTime;
        void main(){
          float d = length(gl_PointCoord-0.5); if(d>0.5) discard;
          float a = smoothstep(0.5,0.0,d);
          vec3 col = vSeed<0.5 ? vec3(0.5,0.72,0.95) : vec3(0.95,0.75,0.4);
          gl_FragColor = vec4(col, a*0.22*(0.5+0.5*sin(uTime+vSeed*80.0)));
        }
      `,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const dust = new THREE.Points(dGeo, this.dustMat);
    dust.frustumCulled = false;
    this.root.add(dust);

    this.scene.add(this.root);
    this.scene.add(new THREE.HemisphereLight(0x8fc3f0, 0x1a1208, 0.5));
  }

  pick(ndcX: number, ndcY: number): SponsorCardData | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = this.raycaster.intersectObjects(this.cardMeshes, false);
    if (hits.length) return (hits[0]!.object.userData.sponsor as SponsorCardData) ?? null;
    return null;
  }

  private roundedPlane(w: number, h: number, r: number): THREE.ShapeGeometry {
    const x = -w / 2;
    const y = -h / 2;
    const s = new THREE.Shape();
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    const geo = new THREE.ShapeGeometry(s, 12);
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) - x) / w;
      uv[i * 2 + 1] = (pos.getY(i) - y) / h;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }

  private makeCardTexture(tier: TierDef): THREE.CanvasTexture {
    const W = 900;
    const H = Math.round((CARD_H / CARD_W) * W);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const hex = '#' + tier.color.toString(16).padStart(6, '0');

    ctx.fillStyle = hex;
    ctx.font = '700 58px "Bricolage Grotesque Variable", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(tier.label.toUpperCase(), 54, 96);

    ctx.fillStyle = 'rgba(241,233,216,0.72)';
    ctx.font = '400 40px "Space Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('YOUR LOGO', W / 2, H / 2 + 40);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  override update({ t, dt, p, pointer }: UpdateArgs): void {
    const N = this.cards.length;
    // Scroll progress through the (tall) sponsor section drives the coverflow.
    // Remap through a buffered range so Partner (first) is held centred until the
    // intro copy has scrolled away, and In-Kind (last) settles before the footer
    // arrives — neither end card gets covered by text.
    const q = THREE.MathUtils.clamp((p - LEAD_IN) / (LEAD_OUT - LEAD_IN), 0, 1);
    const target = q * (N - 1);
    this.front += (target - this.front) * Math.min(1, dt * 6);

    for (let i = 0; i < N; i++) {
      const c = this.cards[i]!;
      const o = i - this.front; // signed distance from the focused slot
      const ao = Math.abs(o);
      const focus = Math.max(0, 1 - ao); // 1 when centred

      const x = o * SPACING + pointer.nx * 0.6;
      const z = -ao * DEPTH;
      const yBob = Math.sin(t * 0.4 + i) * 0.15;
      c.group.position.set(x, Y_OFFSET + yBob + pointer.ny * 0.4, z);
      c.group.rotation.y = -THREE.MathUtils.clamp(o, -2.2, 2.2) * TILT;

      const sc = c.tierScale * (focus * 0.28 + 0.82); // front biggest
      c.group.scale.setScalar(sc);
      // hide far cards so nothing clutters or covers the front
      c.group.visible = ao < 2.6;

      c.mat.uniforms.uTime.value = t;
      c.mat.uniforms.uFocus.value = focus;
    }

    this.coreMat.uniforms.uTime.value = t;
    this.dustMat.uniforms.uTime.value = t;
    this.core.rotation.y = t * 0.1;
    this.core.rotation.x = t * 0.06;
  }
}
