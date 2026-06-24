'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Play, LayoutGrid, Layers } from 'lucide-react';
import type { Game } from '@/shared/types/game';
import { soundEngine } from '@/shared/utils/soundEngine';
import { GameCard } from './GameCard';
import './coverflow.css';

const NOOP = () => {};

function isSafeUrl(url: string): boolean {
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}

// 3D placement for a card at `offset` cards from the focused centre. The centre
// card lies flat and large; flanking cards translate out, recede in Z and turn to
// face inward — the classic coverflow arc. Far cards fade out and stop catching
// pointer events. CSS transitions animate the whole rig when the active index moves.
function cardTransform(offset: number): React.CSSProperties {
  const abs = Math.abs(offset);
  const sign = Math.sign(offset);
  // translate(-50%, -50%) centres the card on the stage's midpoint regardless of
  // its size; the rest of the transform fans it out into the arc.
  if (offset === 0) {
    return { transform: 'translate(-50%, -50%) translateZ(0) rotateY(0deg) scale(1)', opacity: 1, zIndex: 1000, pointerEvents: 'auto' };
  }
  const x = sign * (172 + (abs - 1) * 66);
  const z = -abs * 84;
  const ry = -sign * 52;
  const scale = Math.max(0.72, 1 - abs * 0.05);
  const opacity = Math.max(0.12, 1 - abs * 0.26);
  return {
    transform: `translate(-50%, -50%) translateX(${x}px) translateZ(${z}px) rotateY(${ry}deg) scale(${scale})`,
    opacity,
    zIndex: 1000 - abs * 10,
    pointerEvents: opacity < 0.25 ? 'none' : 'auto',
  };
}

const WINDOW = 6; // render this many cards either side of the focus

type TabId = 'all' | 'slot' | 'mini' | 'new';
const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'slot', label: 'Slots' },
  { id: 'mini', label: 'Originals' },
  { id: 'new', label: 'Hot' },
];

interface CoverflowCardProps {
  readonly game: Game;
  readonly offset: number;
  readonly onActivate: () => void;
  readonly onPlay: () => void;
}

function CoverflowCard({ game, offset, onActivate, onPlay }: CoverflowCardProps) {
  const [err, setErr] = useState(false);
  const isCentre = offset === 0;
  return (
    <button
      type="button"
      className={`cf-card${isCentre ? ' is-centre' : ''}`}
      style={cardTransform(offset)}
      data-cursor={isCentre ? 'PLAY' : 'VIEW'}
      aria-label={isCentre ? `Play ${game.title}` : `Focus ${game.title}`}
      aria-hidden={Math.abs(offset) > 2 ? true : undefined}
      tabIndex={Math.abs(offset) > 2 ? -1 : 0}
      onClick={() => { soundEngine.hover(); isCentre ? onPlay() : onActivate(); }}
    >
      {(!game.image || err) ? (
        <div className="cf-card__fallback"><span>🎰</span><span>{game.title}</span></div>
      ) : (
        <img src={game.image} alt="" draggable={false} loading="lazy" onError={() => setErr(true)} />
      )}
      <span className="cf-card__sheen" aria-hidden="true" />
      {game.isHot && <span className="cf-card__hot">Hot</span>}
    </button>
  );
}

interface GameCoverflowProps {
  readonly games: readonly Game[];
  readonly loading: boolean;
  readonly onClose: () => void;
}

export function GameCoverflow({ games, loading, onClose }: GameCoverflowProps) {
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState<TabId>('all');
  const [view, setView] = useState<'coverflow' | 'grid'>('coverflow');
  const wheelAcc = useRef(0);
  const wheelLock = useRef(false);

  // Category filter — the deck reshuffles to the selected category.
  const list = useMemo(() => {
    if (tab === 'all') return games;
    if (tab === 'new') return games.filter((g) => g.isHot);
    return games.filter((g) => g.category === tab);
  }, [games, tab]);
  useEffect(() => { setActive(0); }, [tab]);

  const clamp = useCallback((i: number) => Math.max(0, Math.min(i, list.length - 1)), [list.length]);
  const go = useCallback((dir: number) => { soundEngine.click(); setActive((a) => clamp(a + dir)); }, [clamp]);

  const playGame = useCallback((game: Game) => {
    if (!isSafeUrl(game.link)) { console.warn(`Coverflow: unsafe link blocked for "${game.title}"`); return; }
    soundEngine.transmission();
    window.dispatchEvent(new CustomEvent('play-game', { detail: { title: game.title, link: game.link } }));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'Escape') { onClose(); }
      else if (e.key === 'Enter' && list[active]) { playGame(list[active]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, playGame, list, active]);

  // Wheel navigation (throttled, accumulates so a flick = one step)
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (wheelLock.current) return;
    wheelAcc.current += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(wheelAcc.current) > 60) {
      go(wheelAcc.current > 0 ? 1 : -1);
      wheelAcc.current = 0;
      wheelLock.current = true;
      window.setTimeout(() => { wheelLock.current = false; }, 220);
    }
  }, [go]);

  // ── Pointer drag / swipe — grab the deck and slide it ───────────────────────
  const STEP = 170; // px of drag per card step
  const stageRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragging = useRef(false);
  const dragged = useRef(false); // true once moved enough — suppresses the ending click

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    dragged.current = false;
    dragStartX.current = e.clientX;
    const el = stageRef.current;
    if (el) { el.style.transition = 'none'; el.setPointerCapture?.(e.pointerId); }
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = Math.max(-STEP * 3, Math.min(STEP * 3, e.clientX - dragStartX.current));
    if (Math.abs(dx) > 8) dragged.current = true;
    const el = stageRef.current;
    if (el) el.style.transform = `translateX(${dx}px)`;
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = e.clientX - dragStartX.current;
    const el = stageRef.current;
    if (el) { el.style.transition = 'transform 0.4s var(--ease-out-expo)'; el.style.transform = 'translateX(0px)'; }
    const steps = Math.round(dx / STEP);
    if (steps !== 0) { soundEngine.click(); setActive((a) => clamp(a - steps)); }
  }, [clamp]);

  const activeGame = list[active];

  return (
    <motion.div
      className="coverflow"
      initial={{ opacity: 0, scale: 1.06 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      role="dialog"
      aria-modal="true"
      aria-label="Game catalogue"
      onWheel={onWheel}
    >
      <header className="coverflow__bar">
        <span className="coverflow__eyebrow">◆ {list.length} {list.length === 1 ? 'title' : 'titles'}</span>
        <div className="tablist coverflow__tabs" role="tablist" aria-label="Game category">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" className="tab" aria-selected={t.id === tab}
              data-cursor="VIEW" onClick={() => { soundEngine.click(); setTab(t.id); }}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="coverflow__right">
          <div className="coverflow__view" role="group" aria-label="View mode">
            <button type="button" className={`coverflow__viewbtn${view === 'coverflow' ? ' is-on' : ''}`} aria-pressed={view === 'coverflow'} data-cursor="VIEW" title="Carousel" onClick={() => { soundEngine.click(); setView('coverflow'); }}>
              <Layers size={16} />
            </button>
            <button type="button" className={`coverflow__viewbtn${view === 'grid' ? ' is-on' : ''}`} aria-pressed={view === 'grid'} data-cursor="VIEW" title="Grid" onClick={() => { soundEngine.click(); setView('grid'); }}>
              <LayoutGrid size={16} />
            </button>
          </div>
          <button type="button" className="coverflow__close" data-cursor="CLOSE" aria-label="Close catalogue" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
      {view === 'coverflow' ? (
        <motion.div key="cf-view" className="coverflow__body"
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
          <div
            ref={stageRef}
            className="coverflow__stage"
            data-cursor="DRAG"
            aria-hidden={loading ? true : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {!loading && list.map((g, i) => {
              const offset = i - active;
              if (Math.abs(offset) > WINDOW) return null;
              return (
                <CoverflowCard
                  key={g.id}
                  game={g}
                  offset={offset}
                  onActivate={() => { if (dragged.current) return; soundEngine.click(); setActive(i); }}
                  onPlay={() => { if (dragged.current) return; playGame(g); }}
                />
              );
            })}
            {loading && <div className="coverflow__loading">Loading catalogue…</div>}
            {!loading && list.length === 0 && <div className="coverflow__loading">No titles in this category</div>}
          </div>

          {activeGame && (
            <motion.div className="coverflow__info" key={activeGame.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
              <span className="coverflow__tag">{activeGame.category === 'slot' ? 'Gladiator Original' : 'MetaWin Original'}</span>
              <h2 className="coverflow__title">{activeGame.title}</h2>
              <p className="coverflow__desc">{activeGame.description}</p>
              <div className="coverflow__meta">
                {activeGame.genre && <span className="coverflow__chip">{activeGame.genre}</span>}
                {activeGame.volatility && <span className="coverflow__chip">{activeGame.volatility} volatility</span>}
                {activeGame.rtp != null && <span className="coverflow__rtp">RTP {activeGame.rtp}%</span>}
              </div>
              <button type="button" className="btn btn--primary coverflow__play" data-cursor="PLAY" onClick={() => playGame(activeGame)}>
                <Play size={15} /> Play Demo
              </button>
            </motion.div>
          )}

          <nav className="coverflow__nav" aria-label="Browse games">
            <button type="button" className="coverflow__arrow" data-cursor="PREV" aria-label="Previous" onClick={() => go(-1)} disabled={active === 0}>
              <ChevronLeft size={22} />
            </button>
            <span className="coverflow__count">{list.length ? active + 1 : 0} / {list.length}</span>
            <button type="button" className="coverflow__arrow" data-cursor="NEXT" aria-label="Next" onClick={() => go(1)} disabled={active >= list.length - 1}>
              <ChevronRight size={22} />
            </button>
          </nav>
        </motion.div>
      ) : (
        <motion.div key="grid-view" className="coverflow__grid-scroll"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
          <div className="coverflow__grid">
            {!loading && list.map((g, i) => <GameCard key={g.id} game={g} index={i} onPlayGame={NOOP} />)}
          </div>
          {!loading && list.length === 0 && <div className="coverflow__loading">No titles in this category</div>}
        </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
}
