import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { ARENA_PAGE_COPY } from '@/features/arena-page/pageCopy';
import { ArenaPageContent } from '@/features/arena-page/ArenaPageContent';
import { usePartnerCovers } from '@/features/partner/usePartnerCovers';
import { coverForGame } from '@/features/arena/hallManifest';
import { playDetail } from '@/features/arena/hallActions';
import { gameKey } from '@/features/starfield/gameIdentity';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { useMotionPreference } from '@/shared/motion/useMotionPreference';
import { soundEngine } from '@/shared/utils/soundEngine';
import type { Game } from '@/shared/types/game';
import { catalogueFocusIndex, focusCatalogueCard } from './catalogueFocus';

type Filter = 'all' | 'slot' | 'mini' | 'hot';
const FILTERS: readonly { readonly id: Filter; readonly label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'slot', label: 'Slots' }, { id: 'mini', label: 'Originals' }, { id: 'hot', label: 'Hot' },
];
interface GamesPageProps {
  readonly titleId: string;
  readonly bodyOnly?: boolean;
  readonly games: readonly Game[];
  readonly loading: boolean;
  readonly onPlayGame: (game: { readonly title: string; readonly link: string }) => void;
  readonly focusGame?: { readonly title: string; readonly request: number } | null;
}

function coverError(event: SyntheticEvent<HTMLImageElement>, fallback: string) {
  const image = event.currentTarget;
  if (fallback && image.dataset.fallback !== 'true') { image.dataset.fallback = 'true'; image.src = fallback; }
  else image.hidden = true;
}

/** Full published catalogue, with the same baked-cover contract as the hall and Client Area. */
export function GamesPage({ titleId, games, loading, onPlayGame, focusGame = null, bodyOnly = false }: GamesPageProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const rootRef = useRef<HTMLElement>(null), handled = useRef<number | null>(null);
  const covers = usePartnerCovers(), phone = useIsMobile(), reducedMotion = useMotionPreference();
  const ordered = useMemo(() => games.slice().sort((a, b) => b.timeline.localeCompare(a.timeline)), [games]);
  const visible = useMemo(() => ordered.filter(game => filter === 'all' || (filter === 'hot' ? game.isHot === true : game.category === filter)), [ordered, filter]);
  useEffect(() => {
    if (!focusGame || handled.current === focusGame.request) return;
    const index = catalogueFocusIndex(ordered, focusGame.title);
    if (index < 0) return;
    const target = ordered[index]!;
    if (!visible.includes(target)) { setFilter(target.category); return; }
    if (focusCatalogueCard(rootRef.current, gameKey(target.title), reducedMotion) && !loading) handled.current = focusGame.request;
  }, [focusGame, ordered, visible, reducedMotion, loading]);
  return <ArenaPageContent titleId={titleId} bodyOnly={bodyOnly} {...ARENA_PAGE_COPY.games}>
    <section ref={rootRef} className="arena-page__section" aria-label="Game catalogue">
      <div className="arena-page__filters" role="group" aria-label="Game category filter">
        {FILTERS.map(({ id, label }) => <button key={id} className="arena-page__action" type="button" aria-pressed={id === filter}
          onClick={() => { if (id !== filter) { soundEngine.click(); setFilter(id); } }}>{label}</button>)}
      </div>
      <p className="arena-page__meta" role="status">{visible.length} {visible.length === 1 ? 'title' : 'titles'}{loading ? ' · Updating catalogue…' : ''}</p>
      <ul className="arena-page__games">
        {visible.map(game => {
          const cover = coverForGame(game, covers.manifest, phone), demo = playDetail(game);
          return <li key={`${game.category}-${game.id}`} data-game-key={gameKey(game.title)} tabIndex={-1}>
            <div className="arena-page__cover">{covers.ready && cover.url && <img key={cover.url} src={cover.url} alt="" width={cover.width} height={cover.height} loading="lazy" decoding="async" onError={event => coverError(event, cover.fallbackUrl)} />}</div>
            <h3>{game.title}</h3><p className="arena-page__meta">{game.genre || (game.category === 'slot' ? 'Slot' : 'Original')}</p>
            <p className="arena-page__meta">RTP {game.rtp === undefined ? '—' : `${Number(game.rtp.toFixed(2))}%`}</p>
            {game.description && <p>{game.description}</p>}
            {demo && <button type="button" className="arena-page__action" aria-label={`Play demo: ${game.title}`}
              onClick={() => { soundEngine.click(); onPlayGame(demo); }}>Play demo</button>}
          </li>;
        })}
      </ul>
      {!visible.length && <p role="status">{games.length ? 'No titles in this category' : 'New titles are on the way.'}</p>}
    </section>
  </ArenaPageContent>;
}
