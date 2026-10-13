import type { Game, GameCategory } from '@/shared/types/game';
import { defaultRtp } from '@/shared/utils/gameRtp';

export interface FeaturedTitle {
  readonly title: string;
  readonly genre: string;
  readonly rtp: string;
  readonly category?: GameCategory;
}

type CatalogueRtp = Pick<Game, 'title' | 'category' | 'rtp'>;

/** Live RTP wins; curated titles identify the category of a missing live title. */
export function mapFeaturedRtp(
  featured: readonly FeaturedTitle[],
  games: readonly CatalogueRtp[],
  curated: readonly Pick<Game, 'title' | 'category'>[],
): readonly FeaturedTitle[] {
  const byTitle = new Map(games.map((g) => [g.title.trim().toLowerCase(), g]));
  const categories = new Map(curated.map((g) => [g.title.trim().toLowerCase(), g.category]));
  return featured.map((entry) => {
    const key = entry.title.trim().toLowerCase();
    const game = byTitle.get(key);
    const category = game?.category ?? entry.category ?? categories.get(key) ?? 'slot';
    const rtp = game?.rtp ?? defaultRtp(category);
    return { ...entry, rtp: `${Number(rtp.toFixed(1))}%` };
  });
}
