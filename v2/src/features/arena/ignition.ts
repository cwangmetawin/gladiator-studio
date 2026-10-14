// The 3D emblem's arrival, as a function of the seconds T since the gate released it (the moment the
// gate's own fade begins). Before T = 0 the emblem waits under the gate already lit, at a bright level
// that matches the gate's lit 2D emblem; it then settles into steel over about 0.7 s, an ignition
// current runs once along every outline, and the glow rim breathes in. After SETTLED_S nothing here
// changes: only the arcs and the pointer move the emblem.

export const FLASH_S = 0.6;
export const CURRENT_START_S = 0.05;
export const CURRENT_S = 0.9;
export const GLIDE_S = 0.9;
export const SETTLED_S = 1.5;

/** Exposure and halo values the static (reduced motion) frame uses: the settled look. */
export const SETTLED = Object.freeze({ exposure: 1, flash: 0, halo: 0.42, current: 0 });

export interface Arrival {
  /** Image exposure multiplier: 1 at rest, higher while the arrival flash lasts. */
  readonly exposure: number;
  /** 0..1: the arrival flash, added to bloom-like effects. */
  readonly flash: number;
  /** Strength of the glow rim behind the metal, 0..1. */
  readonly halo: number;
  /** The ignition current's progress along the outlines: -1 (not started) to 1.4 (done); the shader reads it as `uProgress`. */
  readonly progress: number;
  /** Is the current ribbon still needed? */
  readonly currentOn: boolean;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (t: number): number => 1 - (1 - clamp01(t)) ** 3;

export function arrival(seconds: number): Arrival {
  const T = Math.max(0, seconds);
  const flash = 0.55 * (1 - easeOut(T / FLASH_S));
  const halo = SETTLED.halo + (0.9 - SETTLED.halo) * (1 - smoothstep(0, 0.9, T)) * 0.7;
  const progress = seconds < CURRENT_START_S ? -1 : clamp01((T - CURRENT_START_S) / CURRENT_S) * 1.6 - 0.2;
  return { exposure: 1 + 0.9 * flash, flash, halo, progress, currentOn: seconds < CURRENT_START_S + CURRENT_S + 0.1 };
}

/** The glide from the gate's rectangle to the page's slot, 0..1, eased in and out. */
export function glide(seconds: number): number {
  const t = clamp01(seconds / GLIDE_S);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
