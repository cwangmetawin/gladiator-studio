import type { Game, GameCategory } from '@/shared/types/game';

/** Used only when the catalogue has no owner-supplied RTP. */
export function defaultRtp(category: GameCategory): number {
  return category === 'slot' ? 96.5 : 97;
}

/** The headline "Max RTP": the highest RTP the catalogue shows, so it can never
 *  contradict a game card. With no RTPs at all, the highest category default. */
export function catalogueMaxRtp(games: readonly Pick<Game, 'rtp'>[]): number {
  const shown = games
    .map((g) => g.rtp)
    .filter((rtp): rtp is number => typeof rtp === 'number' && Number.isFinite(rtp) && rtp > 0);
  return shown.length > 0 ? Math.max(...shown) : Math.max(defaultRtp('slot'), defaultRtp('mini'));
}
