import type { Game } from '@/shared/types/game';
import { coverForGame, type CoverManifest, type HallCover } from '@/features/arena/hallManifest';
import { mapFeaturedRtp, type FeaturedTitle } from './featuredCatalogue';

export interface PartnerTitle extends FeaturedTitle { readonly cover: HallCover | null }
type CoverGame = Pick<Game, 'title' | 'category' | 'rtp' | 'image' | 'slug'>;
const identity = (title: string): string => title.trim().toLowerCase();

/** Copy stays editable; published facts/art take precedence over the curated loading roster. */
export function featuredCatalogue(
  featured: readonly FeaturedTitle[], games: readonly CoverGame[], curated: readonly CoverGame[],
  manifest: CoverManifest | null, phone: boolean,
): readonly PartnerTitle[] {
  const live = new Map(games.map(game => [identity(game.title), game]));
  const fallback = new Map(curated.map(game => [identity(game.title), game]));
  return mapFeaturedRtp(featured.filter(entry => entry?.title?.trim()), games, curated).map(entry => {
    const game = live.get(identity(entry.title)) ?? fallback.get(identity(entry.title));
    return { ...entry, cover: game ? coverForGame(game, manifest, phone) : null };
  });
}
