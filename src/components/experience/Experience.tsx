import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { bus } from '~/lib/bus';
import { FXSceneManager, type FXScene } from './FXSceneManager';
import { ParticleMorph } from './scenes/ParticleMorph';
import { CircuitWorld } from './scenes/CircuitWorld';
import { LiquidMetal } from './scenes/LiquidMetal';
import { Crowd } from './scenes/Crowd';
import { FluidSim } from './scenes/FluidSim';

interface Run {
  key: string;
  els: HTMLElement[];
  top: number;
  bottom: number;
  camFrom: number;
  camTo: number;
  scene: FXScene;
}

const DIM: Record<string, number> = {
  morph: 1,
  world: 0.5,
  metal: 0.9,
  crowd: 0.62,
  fluid: 1,
};

function signalReady() {
  bus.ready = true;
  window.dispatchEvent(new Event('experience:ready'));
}

export default function Experience() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const html = document.documentElement;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Capability gate — static gradient background remains underneath
    const probe = document.createElement('canvas');
    const gl2 = probe.getContext('webgl2');
    if (reduced || !gl2) {
      html.classList.add('no-webgl');
      signalReady();
      return;
    }

    const lite =
      matchMedia('(pointer: coarse)').matches ||
      window.innerWidth < 820 ||
      ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) < 6;
    bus.lite = lite;

    let disposed = false;
    let raf = 0;

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.NoToneMapping; // composite pass applies ACES
    root.appendChild(renderer.domElement);

    let w = window.innerWidth;
    let h = window.innerHeight;
    const manager = new FXSceneManager(w * dpr, h * dpr);

    // ── Scenes ──────────────────────────────────────────────────
    const scenes: Record<string, FXScene> = {
      morph: new ParticleMorph(),
      world: new CircuitWorld(),
      metal: new LiquidMetal(),
      crowd: new Crowd(),
      fluid: new FluidSim(),
    };
    const ensureInit = (s: FXScene) => {
      if (!s.initialized) {
        s.init(renderer, lite);
        s.resize(w, h);
      }
    };
    // Init everything except the fluid solver up front; fluid on idle
    for (const key of ['morph', 'world', 'metal', 'crowd']) ensureInit(scenes[key]!);
    const idleInit = () => !disposed && ensureInit(scenes.fluid!);
    'requestIdleCallback' in window
      ? requestIdleCallback(idleInit, { timeout: 3000 })
      : setTimeout(idleInit, 2500);

    // ── Chapter runs from [data-scene] sections ─────────────────
    const resolveKey = (k: string) => (lite && k === 'fluid' ? 'crowd' : k);
    let runs: Run[] = [];

    const buildRuns = () => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('[data-scene]'));
      const grouped: { key: string; els: HTMLElement[] }[] = [];
      for (const el of els) {
        const key = resolveKey(el.dataset.scene || 'world');
        const last = grouped[grouped.length - 1];
        if (last && last.key === key) last.els.push(el);
        else grouped.push({ key, els: [el] });
      }
      const perKey: Record<string, number> = {};
      for (const g of grouped) perKey[g.key] = (perKey[g.key] ?? 0) + 1;
      const seen: Record<string, number> = {};
      runs = grouped.map((g) => {
        const i = seen[g.key] ?? 0;
        seen[g.key] = i + 1;
        const n = perKey[g.key]!;
        return {
          key: g.key,
          els: g.els,
          top: 0,
          bottom: 1,
          camFrom: i / n,
          camTo: (i + 1) / n,
          scene: scenes[g.key]!,
        };
      });
      measure();
    };

    const measure = () => {
      const scroll = bus.getScroll();
      for (const run of runs) {
        const first = run.els[0]!.getBoundingClientRect();
        const last = run.els[run.els.length - 1]!.getBoundingClientRect();
        run.top = first.top + scroll;
        run.bottom = Math.max(last.bottom + scroll, run.top + 1);
      }
    };

    buildRuns();
    // Re-measure once layout settles (fonts, hydration)
    document.fonts?.ready.then(() => !disposed && measure());
    const settleTimer = setTimeout(measure, 1500);

    // ── Frame loop ──────────────────────────────────────────────
    const smoothedPointer = { nx: 0, ny: 0 };
    let last = performance.now();
    let time = 0;
    let readySignaled = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      time += dt;

      smoothedPointer.nx += (bus.pointer.nx - smoothedPointer.nx) * Math.min(1, dt * 5);
      smoothedPointer.ny += (bus.pointer.ny - smoothedPointer.ny) * Math.min(1, dt * 5);

      const scroll = bus.getScroll();
      const vh = window.innerHeight;
      const c = scroll + vh / 2;

      let idx = 0;
      for (let i = 0; i < runs.length; i++) {
        if (c >= runs[i]!.top) idx = i;
      }
      const run = runs[idx];
      if (!run) return;

      let a = run;
      let b: Run | null = null;
      let mix = 0;
      const W = vh * 0.85;
      if (idx < runs.length - 1 && c > run.bottom - W / 2) {
        b = runs[idx + 1]!;
        mix = (c - (run.bottom - W / 2)) / W;
      } else if (idx > 0 && c < run.top + W / 2) {
        a = runs[idx - 1]!;
        b = run;
        mix = (c - (run.top - W / 2)) / W;
      }
      mix = Math.min(1, Math.max(0, mix));
      mix = mix * mix * (3 - 2 * mix); // smoothstep

      const args = (r: Run) => {
        const p = Math.min(1, Math.max(0, (c - r.top) / (r.bottom - r.top)));
        return {
          t: time,
          dt,
          p: r.camFrom + p * (r.camTo - r.camFrom),
          scroll,
          vh,
          pointer: smoothedPointer,
          renderer,
        };
      };

      ensureInit(a.scene);
      a.scene.update(args(a));
      if (b && mix > 0.001) {
        ensureInit(b.scene);
        if (b.scene !== a.scene) b.scene.update(args(b));
      }

      const dim = (DIM[a.key] ?? 1) * (1 - mix) + (DIM[b?.key ?? a.key] ?? 1) * mix;
      manager.render(renderer, a.scene, b && b.scene !== a.scene ? b.scene : null, mix, dim, time);

      if (!readySignaled) {
        readySignaled = true;
        html.classList.add('webgl');
        signalReady();
      }
    };
    raf = requestAnimationFrame(frame);

    // ── Housekeeping ────────────────────────────────────────────
    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        w = window.innerWidth;
        h = window.innerHeight;
        renderer.setSize(w, h);
        manager.resize(w * dpr, h * dpr);
        for (const s of Object.values(scenes)) if (s.initialized) s.resize(w, h);
        measure();
      }, 200);
    };
    window.addEventListener('resize', onResize);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Safety: if the first frame never lands, release the preloader
    const readyFallback = setTimeout(() => !readySignaled && signalReady(), 4000);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(settleTimer);
      clearTimeout(readyFallback);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.dispose();
      root.removeChild(renderer.domElement);
    };
  }, []);

  return <div id="gl" ref={rootRef} aria-hidden="true" />;
}
