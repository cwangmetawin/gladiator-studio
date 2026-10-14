// One place for the arena's quality decisions. Every screen renders at a scale capped at 1.5x the CSS size (a
// retina screen is rendered at 1.5, not 2) with MSAA; a phone also gets a slow automatic sway instead of pointer
// following and a lower anisotropy.
//
// MSAA stays on for phones on purpose: the first plan turned it off there, but without it the wings' thin,
// nearly horizontal edges break into dashes at the 1.5x scale (see m1/probes/r5/crops/phone-aa-compare.png), and
// the site's own starfield already ran with MSAA on phones before the emblem. If a real phone cannot hold its frame
// rate, lower the scale first (MAX_ARENA_DPR); that keeps the edges clean.

export const MAX_ARENA_DPR = 1.5;

export interface ArenaQuality {
  readonly phone: boolean;
  /** Babylon's hardware scaling level: render size = CSS size / level. */
  readonly hardwareScaling: number;
  /** Anisotropic filtering for the chiselled front faces. */
  readonly anisotropy: number;
  /** The pointer is followed; a phone has no hover, so it sways instead. */
  readonly pointer: boolean;
}

export function arenaQuality(phone: boolean, devicePixelRatio: number): ArenaQuality {
  const dpr = Math.max(1, Math.min(MAX_ARENA_DPR, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1));
  return { phone, hardwareScaling: 1 / dpr, anisotropy: phone ? 2 : 8, pointer: !phone };
}
