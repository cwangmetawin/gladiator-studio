import type { ArenaModule, BabylonModule, Scene } from './arenaTypes';
import type { HallItem } from './hallState';

type Texture = InstanceType<BabylonModule['Texture']>;
export type HallTextureLoader = (url: string, onLoad: () => void, onError: () => void) => Texture;
interface CoverResource { texture: Texture; ready: boolean; failed: boolean }

/** Unique owned textures, shared by opposite slabs and their reflections. Only this module retries art. */
export function loadHallTextures(B: BabylonModule, A: ArenaModule, scene: Scene, items: readonly HallItem[],
  requestStatic: () => void, loader?: HallTextureLoader) {
  let disposed = false;
  const owned = new Set<Texture>();
  const neutral = A.RawTexture.CreateRGBATexture(new Uint8Array([18, 26, 34, 255]), 1, 1, scene, false, false);
  owned.add(neutral);
  const load: HallTextureLoader = loader ?? ((url, onLoad, onError) => {
    const texture = new B.Texture(url, scene, false, true, B.Texture.TRILINEAR_SAMPLINGMODE, onLoad, onError);
    texture.wrapU = B.Texture.CLAMP_ADDRESSMODE; texture.wrapV = B.Texture.CLAMP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 4;
    return texture;
  });
  function resource(url: string, fallback?: string): CoverResource {
    const state: CoverResource = { texture: neutral, ready: false, failed: false };
    let generation = 0;
    function attempt(source: string): void {
      const ticket = ++generation;
      const texture = load(source, () => {
        if (disposed || ticket !== generation) return;
        state.ready = true; requestStatic();
      }, () => {
        if (disposed || ticket !== generation) return;
        if (fallback && fallback !== source && ticket === 1) { attempt(fallback); return; }
        generation++; state.texture = neutral; state.failed = true; requestStatic();
      });
      owned.add(texture);
      if (ticket === generation) state.texture = texture;
    }
    if (url) attempt(url);
    else state.failed = true;
    return state;
  }
  const cache = new Map<string, CoverResource>();
  const covers = items.map(({ cover }) => {
    const key = `${cover.url}\n${cover.fallbackUrl}`;
    let value = cache.get(key);
    if (!value) { value = resource(cover.url, cover.fallbackUrl); cache.set(key, value); }
    return value;
  });
  const nebula = resource('/nebula.webp');
  return {
    covers, nebula,
    dispose(): void { if (disposed) return; disposed = true; owned.forEach(texture => texture.dispose()); owned.clear(); },
  };
}
