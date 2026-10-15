import { parseEmblem, type EmblemAsset } from './emblemFormat';

// The baked emblem's files (scripts/bake-emblem.mjs, scripts/bake-env.mjs) and how they are fetched.
// Everything is same-origin (the page's CSP allows 'self' only). The bytes are warmed into the HTTP
// cache while the age gate is still showing, so the click only has to parse and upload them.

export const ARENA_FILES = Object.freeze({
  emblem: '/arena/emblem.bin',
  env: '/arena/studio.env',
});

export function mapUrl(file: string): string { return `/arena/${file}`; }

let emblemPromise: Promise<EmblemAsset> | null = null;

/** The parsed emblem, fetched once. A failure clears the memo so a later call can retry. */
export function loadEmblemAsset(priority: RequestPriority = 'auto'): Promise<EmblemAsset> {
  if (!emblemPromise) {
    emblemPromise = fetch(ARENA_FILES.emblem, { priority })
      .then(response => {
        if (!response.ok) throw new Error(`${ARENA_FILES.emblem}: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(parseEmblem)
      .catch((error: unknown) => { emblemPromise = null; throw error; });
  }
  return emblemPromise;
}

let warmed = false;

/**
 * Start everything the arena will ask for, at low priority and without ever throwing: the emblem file (which
 * also names the two map files), the environment, the arena chunk and Babylon's .env loader chunk.
 */
export function preloadArena(): void {
  if (warmed || typeof window === 'undefined') return;
  warmed = true;
  const low: RequestInit = { priority: 'low' };
  void fetch(ARENA_FILES.env, low).catch(() => {});
  void loadEmblemAsset('low').then(asset => {
    void fetch(mapUrl(asset.maps.normal.file), low).catch(() => {});
    void fetch(mapUrl(asset.maps.rough.file), low).catch(() => {});
  }).catch(() => {});
  void import('./arenaCore').catch(() => {});
  void import('@babylonjs/core/Materials/Textures/Loaders/envTextureLoader.js').catch(() => {});
}
