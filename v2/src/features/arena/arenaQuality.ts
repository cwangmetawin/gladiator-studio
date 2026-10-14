// One place for the arena's quality decisions. A phone gets a lower render scale, no MSAA, a slow
// automatic sway instead of pointer following, and half-size surface maps; a desktop gets the full
// version at a render scale capped at 1.5x the CSS size (a retina screen is rendered at 1.5, not 2).

export const MAX_ARENA_DPR = 1.5;

export interface ArenaQuality {
  readonly phone: boolean;
  /** Babylon's hardware scaling level: render size = CSS size / level. */
  readonly hardwareScaling: number;
  /** The WebGL context's own MSAA. */
  readonly antialias: boolean;
  /** Anisotropic filtering for the chiselled front faces. */
  readonly anisotropy: number;
  /** The pointer is followed; a phone has no hover, so it sways instead. */
  readonly pointer: boolean;
}

export function arenaQuality(phone: boolean, devicePixelRatio: number): ArenaQuality {
  const dpr = Math.max(1, Math.min(MAX_ARENA_DPR, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1));
  return { phone, hardwareScaling: 1 / dpr, antialias: !phone, anisotropy: phone ? 2 : 8, pointer: !phone };
}
