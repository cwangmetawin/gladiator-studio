import type { Game } from '@/shared/types/game';
import { gameKey } from '@/features/starfield/gameIdentity';

/** The request survives lazy loading and always resolves against the published ordering. */
export function catalogueFocusIndex(games: readonly Pick<Game, 'title' | 'slug'>[], requested: string | null): number {
  if (!requested) return -1;
  const key = gameKey(requested);
  return games.findIndex(game => gameKey(game.title) === key || (game.slug !== undefined && gameKey(game.slug) === key));
}
