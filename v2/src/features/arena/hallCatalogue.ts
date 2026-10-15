import type { Game } from '@/shared/types/game';

/** The public catalogue is already publication-filtered. image is its portrait cover contract;
 * landscapeImage is deliberately never used. Keep owner order, including after a live catalogue refresh. */
export function featuredGames(games: readonly Game[]): readonly Game[] {
  const seen = new Set<number>();
  return games.filter(game => {
    if (game.category !== 'slot' || !game.image?.trim() || /(?:horizontal|landscape)/i.test(game.image)
      || ('isPublished' in game && game.isPublished === false) || seen.has(game.id)) return false;
    seen.add(game.id);
    return true;
  }).slice(0, 8);
}

export function gameFacts(game: Game): readonly { readonly label: string; readonly value: string }[] {
  const facts: { label: string; value: string }[] = [];
  if (typeof game.rtp === 'number' && Number.isFinite(game.rtp) && game.rtp > 0 && game.rtp <= 100) {
    facts.push({ label: 'RTP', value: `${game.rtp}%` });
  }
  if (game.volatility) facts.push({ label: 'Volatility', value: game.volatility });
  if (game.category) facts.push({ label: 'Type', value: game.category === 'slot' ? 'Slot' : 'Original' });
  return facts;
}

export function launchMonth(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
