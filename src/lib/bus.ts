// Shared state between the GSAP choreography layer and the WebGL island.
// Attached to globalThis so both bundles always see the same instance.

export interface SiteBus {
  /** Current (smoothed, if ScrollSmoother is active) scroll offset in px. */
  getScroll: () => number;
  pointer: { x: number; y: number; nx: number; ny: number };
  reduced: boolean;
  lite: boolean;
  ready: boolean;
}

const g = globalThis as typeof globalThis & { __siteBus?: SiteBus };

export const bus: SiteBus = (g.__siteBus ??= {
  getScroll: () => (typeof window === 'undefined' ? 0 : window.scrollY),
  pointer: { x: 0, y: 0, nx: 0, ny: 0 },
  reduced: false,
  lite: false,
  ready: false,
});
