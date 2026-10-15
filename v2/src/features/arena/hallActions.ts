import type { Game } from '@/shared/types/game';
import { parseCoverManifest, type CoverManifest } from './hallManifest';

export interface HallPlay { readonly title: string; readonly link: string }

/** Matches the existing catalogue cards' HTTPS-only demo contract. */
export function playDetail(game: Game): HallPlay | null {
  try {
    return new URL(game.link).protocol === 'https:' ? { title: game.title, link: game.link } : null;
  } catch { return null; }
}

export function openAllGames(opener: Pick<HTMLElement, 'focus'>): void {
  opener.focus({ preventScroll: true });
  window.dispatchEvent(new CustomEvent('open-panel', { detail: 'games' }));
}

export async function loadCoverManifest(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<CoverManifest | null> {
  try {
    const response = await fetcher('/arena/games/manifest.json', { signal, credentials: 'same-origin' });
    return response.ok ? parseCoverManifest(await response.json()) : null;
  } catch {
    // A new deployment may precede the first bake, or the visitor may be offline.
    // Catalogue covers and steel lighting remain complete usable fallbacks.
    return null;
  }
}
