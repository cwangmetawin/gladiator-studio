import { sceneReadiness } from '@/features/starfield/sceneReadiness';

// Warm the HTTP cache with the homepage scene's first-visible textures while the
// visitor is still on the age gate, so the cosmos is ready the moment the first screen
// appears instead of developing in seconds later. Babylon requests the same
// same-origin URLs afterwards and is served from cache. The 3D emblem's files
// (arenaAssets.preloadArena) and the first screen's own chunk are warmed the same way,
// but later: see HOME_WARMUP_DELAY_MS. The first screen shows no planet (Phase 4), so
// their surfaces are not warmed here: they load after the hand-off (planetSurfaces).

const FIRST_VISIBLE = [
  '/nebula.webp',
] as const;

let started = false;
let modulePromise: Promise<typeof import('@/shared/babylon/babylonCore')> | null = null;

export function loadSceneModule(): Promise<typeof import('@/shared/babylon/babylonCore')> {
  if (!modulePromise) {
    modulePromise = import('@/shared/babylon/babylonCore').then(module => {
      sceneReadiness.mark('module');
      return module;
    }).catch((error: unknown) => {
      modulePromise = null; // A failed speculative fetch can retry on acceptance.
      throw error;
    });
  }
  return modulePromise;
}

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

/** The starfield's own files: its textures, Babylon and the scene's chunk. */
function preloadSceneBase(): void {
  preloadSceneTextures();
  void loadSceneModule().catch(() => {});
  void import('@/features/starfield/StarfieldBackground').catch(() => {});
}

let homeWarmed = false;

/** The first screen's own files, once: its chunk (the headline and the top bar), the 3D emblem's files and the arena chunk. */
export function preloadHome(): void {
  if (homeWarmed) return;
  homeWarmed = true;
  void import('@/features/arena/arenaAssets').then(module => { module.preloadArena(); }).catch(() => {});
  void import('@/features/arena/home').catch(() => {});
}

/** The visitor answered the gate: everything the first screen needs, now. */
export function preloadScene(): void {
  preloadSceneBase();
  preloadHome();
}

/**
 * How long the gate is up before the first screen's files are warmed, if the visitor has not shown a sign by then.
 * Straight after the first paint they would be requests that start before the gate's own largest paint, which a
 * Lighthouse run counts against the gate (measured: 21 more requests and 437 KB cost the gate 2-3 points and 3 s of
 * simulated LCP). Three seconds is after the gate has painted, and a visitor who reads it that long is still ahead of the click.
 */
export const HOME_WARMUP_DELAY_MS = 3000;
/**
 * Any of these says the visitor is there and about to answer: the first screen's files are warmed at once. Not focusin:
 * the gate focuses its own button when it opens, and that is not a visitor.
 */
const SIGNS = ['pointerdown', 'pointermove', 'keydown', 'touchstart'] as const;

/**
 * While the age gate is up. A frame plus a task lets it paint before speculative downloads; then the scene's own files
 * are warmed, and the first screen's wait for a sign of the visitor or HOME_WARMUP_DELAY_MS. Returns the undo.
 */
export function scheduleScenePreload(): () => void {
  let cancelled = false;
  let timer: number | undefined;
  const stop = (): void => {
    for (const type of SIGNS) window.removeEventListener(type, warm, true);
    if (timer !== undefined) window.clearTimeout(timer);
  };
  function warm(): void { stop(); preloadHome(); }
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      if (cancelled) return;
      preloadSceneBase();
      for (const type of SIGNS) window.addEventListener(type, warm, { capture: true, passive: true });
      timer = window.setTimeout(warm, HOME_WARMUP_DELAY_MS);
    }, 0);
  });
  return () => { cancelled = true; stop(); };
}
