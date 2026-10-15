import type { CSSProperties, Ref } from 'react';
import type { Game } from '@/shared/types/game';
import { gameFacts, launchMonth } from './hallCatalogue';
import { openAllGames } from './hallActions';
import type { HallCover } from './hallManifest';

interface HallCopyProps {
  readonly games: readonly Game[];
  readonly index: number;
  readonly total: number;
  readonly visible: boolean;
  readonly activated: boolean;
  readonly rendered: boolean;
  readonly cover: HallCover | null;
  readonly rootRef: Ref<HTMLElement>;
  readonly onSelect: (index: number) => void;
  readonly onPlay: (game: Game) => void;
}

function StaticCover({ cover }: { readonly cover: HallCover }) {
  return <img key={cover.url} className="hall-static" src={cover.url} alt="" aria-hidden="true"
    width={cover.width} height={cover.height} draggable={false} decoding="async"
    onError={event => {
      const image = event.currentTarget;
      if (!image.dataset.retried && cover.url !== cover.fallbackUrl) {
        image.dataset.retried = 'true'; image.src = cover.fallbackUrl;
      } else image.style.visibility = 'hidden';
    }} />;
}

/** DOM owns names, facts, focus and actions. A single static cover also serves loading/no-WebGL. */
export function HallCopy({ games, index, total, visible, activated, rendered, cover, rootRef, onSelect, onPlay }: HallCopyProps) {
  const game = games[index], month = game ? launchMonth(game.timeline) : '';
  const titleSize = Math.min(10.8, 125 / Math.max(1, game?.title.length ?? 10));
  const style = { '--hall-title-size': `clamp(96px, ${titleSize.toFixed(2)}vw, 164px)` } as CSSProperties;
  return (
    <section ref={rootRef} className="arena-landing hall" aria-labelledby="arena-roster-title"
      aria-hidden={!visible} inert={!visible} data-hall-index={index} data-hall-count={games.length}>
      {activated && cover && !rendered && <StaticCover cover={cover} />}
      <div className="hall-copy" style={style}>
        <div className="hall-copy__game" key={game?.id ?? 'empty'}>
          <p className="hall-meta">
            {game ? <><span>{String(index + 1).padStart(2, '0')} / {String(games.length).padStart(2, '0')}</span>
              <span className="hall-meta__rule" aria-hidden="true" />
              {game.genre && <span>{game.genre} {game.category === 'slot' ? 'slot' : ''}</span>}
              {month && <span>{month}</span>}</> : '02 / Hall of games'}
          </p>
          <h2 id="arena-roster-title">{game?.title ?? 'The arena'}</h2>
          {game ? <dl className="hall-facts">{gameFacts(game).map(fact => (
            <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
          ))}</dl> : <p className="hall-empty">Explore the studio’s published games.</p>}
        </div>
        <div className="hall-controls">
          <div className="hall-actions">
            {game && <button type="button" className="hall-button hall-play" onClick={event => {
              event.currentTarget.focus({ preventScroll: true }); onPlay(game);
            }}>Play demo <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5" /></svg></button>}
            <button type="button" className="hall-button hall-all" onClick={event => openAllGames(event.currentTarget)}>All {total} games</button>
          </div>
          {games.length > 0 && <nav className="hall-ticks" aria-label="Featured games">
            {games.map((item, at) => <button type="button" key={item.id} aria-label={`Show ${item.title}`}
              aria-current={at === index ? 'true' : undefined} onClick={() => onSelect(at)}><span /></button>)}
          </nav>}
          <p className="hall-hint">Scroll or drag <span aria-hidden="true">/</span> Arrow keys</p>
        </div>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{visible && game ? `${game.title}. ${index + 1} of ${games.length}.` : ''}</p>
    </section>
  );
}
