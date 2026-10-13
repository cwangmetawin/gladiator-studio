import type { Game } from '@/shared/types/game';
import { gameKey } from '@/features/starfield/gameIdentity';

/** The request survives lazy loading and always resolves against the published ordering. */
export function catalogueFocusIndex(games: readonly Pick<Game, 'title' | 'slug'>[], requested: string | null): number {
  if (!requested) return -1;
  const key = gameKey(requested);
  return games.findIndex(game => gameKey(game.title) === key || (game.slug !== undefined && gameKey(game.slug) === key));
}

export type PhoneCatalogueTab = 'slot' | 'mini' | 'new';

/** Preserve the phone's existing newest spotlight, then its date-sorted grid. */
export function catalogueDisplayOrder(games: readonly Game[]): readonly Game[] {
  if (games.length === 0) return games;
  const featured = games.reduce((a, b) => b.timeline > a.timeline ? b : a);
  return [featured, ...games.filter(game => game.id !== featured.id).sort((a, b) => b.timeline.localeCompare(a.timeline))];
}

interface PhoneCatalogueFocus {
  readonly tab: PhoneCatalogueTab;
  readonly index: number;
  readonly key: string;
}

/** Stay in the current tab when it holds the game; otherwise choose its category. */
export function resolvePhoneCatalogueFocus(
  slotGames: readonly Game[], miniGames: readonly Game[], activeTab: PhoneCatalogueTab, requested: string | null,
): PhoneCatalogueFocus | null {
  if (!requested) return null;
  function resolve(tab: PhoneCatalogueTab): PhoneCatalogueFocus | null {
    const games = tab === 'slot' ? slotGames : tab === 'mini' ? miniGames
      : [...slotGames, ...miniGames].filter(game => game.isHot === true);
    const ordered = catalogueDisplayOrder(games);
    const index = catalogueFocusIndex(ordered, requested);
    return index < 0 ? null : { tab, index, key: gameKey(ordered[index]!.title) };
  }
  return resolve(activeTab) ?? resolve('slot') ?? resolve('mini');
}

/** Match the stable title key without interpolating game names into CSS selectors. */
export function focusCatalogueCard(root: ParentNode | null, key: string, reducedMotion: boolean): boolean {
  const cards = root?.querySelectorAll<HTMLElement>('[data-game-key]');
  if (!cards) return false;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    if (card.dataset.gameKey !== key) continue;
    card.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center', inline: 'nearest' });
    card.focus({ preventScroll: true });
    return true;
  }
  return false;
}
