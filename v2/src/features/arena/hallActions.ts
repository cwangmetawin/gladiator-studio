import type { Game } from '@/shared/types/game';

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
