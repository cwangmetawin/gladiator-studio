// Warm the HTTP cache with the homepage scene's first-visible textures while the
// visitor is still on the age gate / warp intro, so the cosmos is ready the moment
// the HUD appears instead of developing in seconds later. Babylon requests the same
// same-origin URLs afterwards and is served from cache.

const FIRST_VISIBLE = [
  '/nebula.webp',
  '/textures/earth_day.webp',
  '/textures/earth_night_2k.webp',
  '/textures/planet_moon.webp',
  '/textures/planet_jupiter.webp',
  '/textures/planet_saturn.webp',
] as const;

let started = false;

export function preloadSceneTextures(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  for (const src of FIRST_VISIBLE) {
    const img = new Image();
    // Same request mode as Babylon's loader (Tools.CorsBehavior = 'anonymous') so the
    // browser can reuse this response for the texture fetch.
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.src = src;
  }
}
