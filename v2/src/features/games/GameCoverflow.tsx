'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Play, LayoutGrid, Layers } from 'lucide-react';
import type { Game } from '@/shared/types/game';
import { soundEngine } from '@/shared/utils/soundEngine';
import './coverflow.css';

function isSafeUrl(url: string): boolean {
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}

type TabId = 'all' | 'slot' | 'mini' | 'new';
const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'slot', label: 'Slots' },
  { id: 'mini', label: 'Originals' },
  { id: 'new', label: 'Hot' },
];

const PAD = 8;
const GRID_GAP = 16;
const GRID_MIN = 150;     // min grid cell width
const FAN_GAP = 116;      // horizontal step between fanned neighbours
const CENTRE_W = 264;     // target on-screen width of the focused carousel card
const FADE = 6;           // carousel cards beyond this offset fade out
const SPRING = { type: 'spring', stiffness: 280, damping: 32, mass: 0.7 } as const;

interface Geo { cols: number; cellW: number; cellH: number; totalH: number; }

interface CardTarget { x: number; y: number; scale: number; opacity: number; z: number; }

interface DeckCardProps {
  readonly game: Game;
  readonly cellW: number;
  readonly cellH: number;
  readonly target: CardTarget;
  readonly grid: boolean;
  readonly centre: boolean;
  readonly onClick: () => void;
}

function DeckCard({ game, cellW, cellH, target, grid, centre, onClick }: DeckCardProps) {
  const [err, setErr] = useState(false);
  return (
    <motion.button
      type="button"
      className={`deck-card${centre ? ' is-centre' : ''}${grid ? ' is-grid' : ''}`}
      data-cursor={grid || centre ? 'PLAY' : 'VIEW'}
      aria-label={grid || centre ? `Play ${game.title}` : `Focus ${game.title}`}
      aria-hidden={!grid && Math.abs(target.scale) < 0.4 ? true : undefined}
      onClick={onClick}
      initial={false}
      animate={{ x: target.x, y: target.y, scale: target.scale, opacity: target.opacity }}
      transition={SPRING}
      style={{ position: 'absolute', top: 0, left: 0, width: cellW, height: cellH, zIndex: target.z }}
    >
      {(!game.image || err) ? (
        <span className="deck-card__fallback"><span>🎰</span><span>{game.title}</span></span>
      ) : (
        <img src={game.image} alt="" draggable={false} loading="lazy" onError={() => setErr(true)} />
      )}
      <span className="deck-card__grad" aria-hidden="true" />
      <span className="deck-card__title">{game.title}</span>
      {game.isHot && <span className="deck-card__hot">Hot</span>}
      <span className="deck-card__sheen" aria-hidden="true" />
    </motion.button>
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
  const [size, setSize] = useState({ w: 1000, h: 520 });
  const wheelAcc = useRef(0);
  const wheelLock = useRef(false);

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

  // ── Deck measurement ────────────────────────────────────────────────────────
  const deckRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = deckRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Grid geometry derived from the measured deck width — cells are placed by
  // maths, so they can never overlap regardless of the carousel ↔ grid morph.
  const geo: Geo = useMemo(() => {
    const W = Math.max(320, size.w);
    const cols = Math.max(2, Math.floor((W - 2 * PAD + GRID_GAP) / (GRID_MIN + GRID_GAP)));
    const cellW = (W - 2 * PAD - (cols - 1) * GRID_GAP) / cols;
    const cellH = cellW * (4 / 3);
    const rows = Math.max(1, Math.ceil(list.length / cols));
    const totalH = 2 * PAD + rows * cellH + (rows - 1) * GRID_GAP;
    return { cols, cellW, cellH, totalH };
  }, [size.w, list.length]);

  const targetFor = useCallback((i: number): CardTarget => {
    const { cols, cellW, cellH } = geo;
    if (view === 'grid') {
      const col = i % cols, row = Math.floor(i / cols);
      return { x: PAD + col * (cellW + GRID_GAP), y: PAD + row * (cellH + GRID_GAP), scale: 1, opacity: 1, z: 1 };
    }
    const o = i - active;
    const abs = Math.abs(o);
    const centreScale = Math.min(1.8, CENTRE_W / cellW);
    const scale = centreScale * Math.max(0.55, 1 - abs * 0.12);
    const cx = size.w / 2, cy = size.h * 0.46;
    return {
      x: cx + o * FAN_GAP - cellW / 2,
      y: cy - cellH / 2,
      scale,
      opacity: abs > FADE ? 0 : Math.max(0.16, 1 - abs * 0.16),
      z: 1000 - abs * 10,
    };
  }, [geo, view, active, size.w, size.h]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view === 'coverflow' && e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (view === 'coverflow' && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'Escape') { onClose(); }
      else if (e.key === 'Enter' && list[active]) { playGame(list[active]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, playGame, list, active, view]);

  // Wheel nav (carousel only)
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (view !== 'coverflow' || wheelLock.current) return;
    wheelAcc.current += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(wheelAcc.current) > 60) {
      go(wheelAcc.current > 0 ? 1 : -1);
      wheelAcc.current = 0;
      wheelLock.current = true;
      window.setTimeout(() => { wheelLock.current = false; }, 220);
    }
  }, [go, view]);

  // Pointer drag / swipe (carousel only) — translate the deck, snap on release
  const STEP = 150;
  const dragStartX = useRef(0);
  const dragging = useRef(false);
  const dragged = useRef(false);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (view !== 'coverflow') return;
    dragging.current = true; dragged.current = false; dragStartX.current = e.clientX;
    const el = deckRef.current;
    if (el) { el.style.transition = 'none'; el.setPointerCapture?.(e.pointerId); }
  }, [view]);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = Math.max(-STEP * 3, Math.min(STEP * 3, e.clientX - dragStartX.current));
    if (Math.abs(dx) > 8) dragged.current = true;
    const el = deckRef.current;
    if (el) el.style.transform = `translateX(${dx}px)`;
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = e.clientX - dragStartX.current;
    const el = deckRef.current;
    if (el) { el.style.transition = 'transform 0.35s var(--ease-out-expo)'; el.style.transform = 'translateX(0px)'; }
    const steps = Math.round(dx / STEP);
    if (steps !== 0) { soundEngine.click(); setActive((a) => clamp(a - steps)); }
  }, [clamp]);

  const grid = view === 'grid';
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
            <button type="button" className={`coverflow__viewbtn${!grid ? ' is-on' : ''}`} aria-pressed={!grid} data-cursor="VIEW" title="Carousel" onClick={() => { soundEngine.click(); setView('coverflow'); }}>
              <Layers size={16} />
            </button>
            <button type="button" className={`coverflow__viewbtn${grid ? ' is-on' : ''}`} aria-pressed={grid} data-cursor="VIEW" title="Grid" onClick={() => { soundEngine.click(); setView('grid'); }}>
              <LayoutGrid size={16} />
            </button>
          </div>
          <button type="button" className="coverflow__close" data-cursor="CLOSE" aria-label="Close catalogue" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Deck — every card is absolutely placed by computed coordinates and tweened
          between the fan and the grid, so the grid can never overlap. */}
      <div
        ref={deckRef}
        className={`coverflow__deck ${grid ? 'is-grid' : 'is-carousel'}`}
        data-cursor={grid ? undefined : 'DRAG'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {grid && <div aria-hidden="true" style={{ height: geo.totalH }} />}
        {!loading && list.map((g, i) => (
          <DeckCard
            key={g.id}
            game={g}
            cellW={geo.cellW}
            cellH={geo.cellH}
            target={targetFor(i)}
            grid={grid}
            centre={!grid && i === active}
            onClick={() => {
              if (grid) { playGame(g); return; }
              if (dragged.current) return;
              if (i === active) playGame(g);
              else { soundEngine.click(); setActive(i); }
            }}
          />
        ))}
        {loading && <div className="coverflow__loading">Loading catalogue…</div>}
        {!loading && list.length === 0 && <div className="coverflow__loading">No titles in this category</div>}
      </div>

      {/* Active-game info + nav — carousel only */}
      {!grid && activeGame && (
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

      {!grid && (
        <nav className="coverflow__nav" aria-label="Browse games">
          <button type="button" className="coverflow__arrow" data-cursor="PREV" aria-label="Previous" onClick={() => go(-1)} disabled={active === 0}>
            <ChevronLeft size={22} />
          </button>
          <span className="coverflow__count">{list.length ? active + 1 : 0} / {list.length}</span>
          <button type="button" className="coverflow__arrow" data-cursor="NEXT" aria-label="Next" onClick={() => go(1)} disabled={active >= list.length - 1}>
            <ChevronRight size={22} />
          </button>
        </nav>
      )}
    </motion.div>
  );
}
