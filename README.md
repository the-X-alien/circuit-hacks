# CIRCUIT HACKS — 24-Hour Hardware Hackathon Site

Cinematic single-page site for a free 24-hour high-school hardware hackathon in the Bay Area (late October 2026). Astro + React + Three.js + GSAP, with a continuous WebGL narrative running behind accessible DOM content.

**WebGL chapters:** particle chip morph (hero) → PCB flythrough corridor → liquid metal → crowd → **sponsor tree** (rotating trunk with 3D cards on branches, Cove Hacks–style tiers ascending) → fluid finale.

## Quick start

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # static output in dist/
npm run preview
```

## Everything you'll want to change lives in `src/config.ts`

```ts
EVENT_NAME     // "SIGNAL://LOST" placeholder — swap when the name lands
EVENT_DATE     // "October 24–25, 2026"
RSVP_URL       // Fillout form link (placeholder)
CONTACT_URL    // Fillout form link (placeholder)
SPONSOR_EMAIL / GENERAL_EMAIL
```

Other swap points:

- **Sponsors**: tier slots in `src/components/ui/Sponsors.astro`
- **Team roster**: `src/components/ui/Team.astro`
- **Schedule**: `src/components/ui/Schedule.astro`
- **FAQ copy**: `src/components/ui/Faq.tsx`

## Architecture

- `src/pages/index.astro` — the single scrollable page
- `src/scripts/main.ts` — GSAP ScrollSmoother + SplitText choreography
- `src/components/experience/` — the WebGL layer:
  - `Experience.tsx` (client:only island) maps `[data-scene]` sections to scene "chapters" and crossfades between them via `FXSceneManager` (render-target compositing with ACES tone mapping, grain, vignette)
  - Scenes: `ParticleMorph` (hero chip glyph), `CircuitWorld` (motherboard city), `LiquidMetal` (reactive chrome blob), `Crowd` (instanced amphitheater), `FluidSim` (GPU Navier-Stokes finale)

## Performance & fallbacks

- Pixel ratio clamped to 2, resize debounced, offscreen scenes don't tick
- Mobile/low-memory devices get a lite mode (reduced particle counts, fluid sim swapped out)
- `prefers-reduced-motion` or no WebGL2 → static gradient background, all content intact
- All content is server-rendered DOM; the canvas is decorative (`aria-hidden`)

## Deploy

Static output — deploys to Vercel with zero config (`vercel` or connect the repo; framework preset: Astro).
