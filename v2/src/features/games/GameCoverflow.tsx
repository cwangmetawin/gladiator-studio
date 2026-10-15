'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { motion, useIsPresent } from 'framer-motion';
import { useDialogFocus } from '@/shared/hooks/useDialogFocus';
import { motionTokens, transitionTimeline } from '@/shared/motion/tokens';
import type { TransitionState } from '@/shared/motion/transition';
import { PanelMotionContext } from '@/shared/motion/panelMotion';
import { Reveal } from '@/shared/ui/Reveal';
import { X, ChevronLeft, ChevronRight, Play, LayoutGrid, Layers } from 'lucide-react';
import type { Game } from '@/shared/types/game';
import { soundEngine } from '@/shared/utils/soundEngine';
import { skyStore } from '@/features/starfield/skyStore';
import { catalogueFocusIndex } from './catalogueFocus';
import { createCatalogueLock } from '@/shared/audio/transitionSound';
import { useGameCover } from './useGameCover';
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
  readonly onLock: () => void;
  readonly durationMs?: number;
}

function DeckCard({ game, cellW, cellH, target, grid, centre, onClick, onLock, durationMs }: DeckCardProps) {
  const cover = useGameCover(game);
  return (
    <motion.button
      type="button"
      className={`deck-card${centre ? ' is-centre' : ''}${grid ? ' is-grid' : ''}`}
      data-cursor={grid || centre ? 'PLAY' : 'VIEW'}
      aria-label={grid || centre ? `Play ${game.title}` : `Focus ${game.title}`}
      aria-hidden={!grid && Math.abs(target.scale) < 0.4 ? true : undefined}
      tabIndex={target.opacity === 0 ? -1 : undefined}
      onClick={onClick}
      onAnimationComplete={() => { if (centre && !grid) onLock(); }}
      initial={false}
      animate={{ x: target.x, y: target.y, scale: target.scale, opacity: target.opacity }}
      transition={durationMs === undefined ? SPRING : { duration: durationMs / 1000, ease: motionTokens.ease }}
      style={{ position: 'absolute', top: 0, left: 0, width: cellW, height: cellH, zIndex: target.z }}
    >
      {!cover.src ? (
        <span className="deck-card__fallback"><span>🎰</span><span>{game.title}</span></span>
      ) : (
        <img src={cover.src} alt="" draggable={false} loading="lazy" onError={cover.onError} />
      )}
      <span className="deck-card__grad" aria-hidden="true" />
      <span className="deck-card__title">{game.title}</span>
      {game.isHot && <span className="deck-card__hot">Hot</span>}
      <span className="deck-card__sheen" aria-hidden="true" />
    </motion.button>
  );
}

// Landscape key-art showcase for the focused game, shown at its TRUE proportions
// (never cropped). Only games that actually ship landscape art get a banner —
// games without it (and any that fail to load) render nothing. Re-keyed per game
// so the art crossfades as the focus changes.
function HeroBanner({ game, onPlay }: { readonly game: Game; readonly onPlay: () => void }) {
  const [failed, setFailed] = useState(false);
  if (!game.landscapeImage || failed) return null;
  return (
    <Reveal className="coverflow__hero" y={14}>
      <img
        className="coverflow__hero-art"
        src={game.landscapeImage}
        alt={`${game.title} key art`}
        draggable={false}
        onError={() => setFailed(true)}
      />
      <div className="coverflow__hero-actions">
        {game.rtp != null && <span className="coverflow__rtp">RTP {game.rtp}%</span>}
        <button type="button" className="btn btn--primary coverflow__play" data-cursor="PLAY" onClick={onPlay}>
          <Play size={15} /> Play Demo
        </button>
      </div>
    </Reveal>
  );
}

interface GameCoverflowProps {
  readonly games: readonly Game[];
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly suspended: boolean;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly narrative: TransitionState;
}

export function GameCoverflow({ games, loading, onClose, suspended, returnFocusRef, narrative }: GameCoverflowProps) {
  const titleId = useId();
  const isPresent = useIsPresent();
  const dialogRef = useDialogFocus<HTMLDivElement>({ active: isPresent, onEscape: onClose, returnFocusRef });
  const timeline = transitionTimeline(narrative.mode, narrative.kind);
  const closing = narrative.phase === 'closing';
  const [active, setActive] = useState(() => Math.max(0, catalogueFocusIndex(games, narrative.focusGame)));
  const [tab, setTab] = useState<TabId>('all');
  const [view, setView] = useState<'coverflow' | 'grid'>('coverflow');
  const [size, setSize] = useState({ w: 1000, h: 520 });
  const wheelAcc = useRef(0);
  const wheelLock = useRef(false);
  const catalogueLock = useMemo(() => createCatalogueLock(() => soundEngine.catalogueFocus()), []);

  const list = useMemo(() => {
    if (tab === 'all') return games;
    if (tab === 'new') return games.filter((g) => g.isHot);
    return games.filter((g) => g.category === tab);
  }, [games, tab]);
  useLayoutEffect(() => {
    const index = catalogueFocusIndex(games, narrative.focusGame);
    if (index < 0) return;
    setTab('all');
    setView('coverflow');
    setActive(index);
  }, [games, narrative.focusGame]);

  const clamp = useCallback((i: number) => Math.max(0, Math.min(i, list.length - 1)), [list.length]);
  const go = useCallback((dir: number) => { setActive((a) => clamp(a + dir)); }, [clamp]);

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
    const W = Math.max(1, size.w);
    const cols = Math.max(1, Math.floor((W - 2 * PAD + GRID_GAP) / (GRID_MIN + GRID_GAP)));
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
    const centreScale = Math.max(0.1, Math.min(1.8, Math.min(CENTRE_W, size.w - 2 * PAD) / cellW, (size.h - 12) / cellH));
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
    if (suspended || !isPresent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Enter' && e.target instanceof Element && e.target.closest('button, a, input, select, textarea')) return;
      if (view === 'coverflow' && e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (view === 'coverflow' && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'Enter' && list[active]) { playGame(list[active]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, playGame, list, active, view, suspended, isPresent]);

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
  const dragStartActive = useRef(0);
  const pointerId = useRef<number | null>(null);
  const dragging = useRef(false);
  const dragged = useRef(false);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (view !== 'coverflow' || suspended || closing || e.button !== 0 || !e.isPrimary) return;
    dragging.current = true; dragged.current = false; dragStartX.current = e.clientX;
    dragStartActive.current = active;
    pointerId.current = e.pointerId;
    skyStore.beginDrag(e.clientX, e.timeStamp);
    const el = deckRef.current;
    // NB: do NOT capture the pointer here — capturing retargets the synthesized
    // `click` to the deck, so a card tap would never reach the card's onClick.
    if (el) el.style.transition = 'none';
  }, [view, active, suspended, closing]);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || e.pointerId !== pointerId.current) return;
    const dx = Math.max(-STEP * 3, Math.min(STEP * 3, e.clientX - dragStartX.current));
    // Capture only once a real drag starts, so taps stay taps and drags keep
    // tracking even if the pointer leaves the deck.
    if (Math.abs(dx) > 8 && !dragged.current) {
      dragged.current = true;
      deckRef.current?.setPointerCapture?.(e.pointerId);
    }
    // No RAF or React effect between pointer input and the scene's shared state.
    skyStore.moveDrag(e.clientX, e.timeStamp);
    const focused = list[clamp(dragStartActive.current - Math.round(dx / STEP))];
    if (focused) skyStore.focusGame(focused.title);
    const el = deckRef.current;
    if (el) el.style.transform = `translateX(${dx}px)`;
  }, [clamp, list]);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || e.pointerId !== pointerId.current) return;
    dragging.current = false;
    pointerId.current = null;
    skyStore.releaseDrag(e.timeStamp);
    const dx = Math.max(-STEP * 3, Math.min(STEP * 3, e.clientX - dragStartX.current));
    const el = deckRef.current;
    if (el?.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (el) { el.style.transition = narrative.mode === 'reduced' ? 'none' : 'transform 0.35s var(--ease-out-expo)'; el.style.transform = 'translateX(0px)'; }
    const steps = Math.round(dx / STEP);
    if (steps !== 0) setActive(clamp(dragStartActive.current - steps));
  }, [clamp, narrative.mode]);

  const cancelDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    dragged.current = true;
    skyStore.releaseDrag(performance.now());
    const el = deckRef.current;
    if (pointerId.current !== null && el?.hasPointerCapture?.(pointerId.current)) el.releasePointerCapture(pointerId.current);
    pointerId.current = null;
    if (el) el.style.transform = 'translateX(0px)';
    const game = list[clamp(active)];
    if (game) skyStore.focusGame(game.title);
  }, [active, clamp, list]);
  useEffect(() => {
    if (view !== 'coverflow' || suspended || closing || !isPresent) cancelDrag();
    return cancelDrag;
  }, [view, suspended, closing, isPresent, cancelDrag]);

  const grid = view === 'grid';
  const activeGame = list[active];
  const focusedTitleRef = useRef(activeGame?.title);
  focusedTitleRef.current = activeGame?.title;
  useLayoutEffect(() => {
    if (activeGame) {
      skyStore.focusGame(activeGame.title);
      catalogueLock.prime(activeGame.title);
      if (narrative.mode === 'reduced' && !grid && !suspended && !closing && isPresent) catalogueLock.lock(activeGame.title);
    }
  }, [activeGame, catalogueLock, narrative.mode, grid, suspended, closing, isPresent]);
  const instantContent = narrative.mode !== 'desktop' || narrative.phase === 'open';

  return (
    <PanelMotionContext.Provider value={{ mode: narrative.mode, timeline, enteredAt: narrative.panelStartedAt,
      settled: narrative.phase === 'open', instantContent: narrative.mode !== 'desktop' }}>
    <motion.div
      ref={dialogRef}
      className="coverflow"
      data-active-game={activeGame?.title ?? ''}
      data-active-index={active}
      initial={narrative.phase === 'open' ? false : { opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: (isPresent ? closing ? timeline.exitMs : timeline.frameMs : closing ? 0 : timeline.exitMs) / 1000, ease: motionTokens.ease }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onWheel={onWheel}
      style={{ pointerEvents: closing ? 'none' : 'auto' }}
    >
      <span id={titleId} className="sr-only">Game catalogue</span>
      <header className="coverflow__bar">
        <Reveal stage="eyebrow" y={0}>
          <span className="coverflow__eyebrow">◆ {loading ? 'Titles' : `${list.length} ${list.length === 1 ? 'title' : 'titles'}`}</span>
        </Reveal>
        <div className="tablist coverflow__tabs" role="tablist" aria-label="Game category">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" className="tab" aria-selected={t.id === tab}
              data-cursor="VIEW" onClick={() => { setTab(t.id); setActive(0); }}>
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
      <motion.div
        ref={deckRef}
        className={`coverflow__deck ${grid ? 'is-grid' : 'is-carousel'}`}
        data-cursor={grid ? undefined : 'DRAG'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
        onPointerLeave={e => { if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) onPointerUp(e); }}
        initial={instantContent ? false : { opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: instantContent ? 0 : timeline.revealMs / 1000,
          delay: instantContent ? 0 : Math.max(0, narrative.panelStartedAt + timeline.titleDelayMs - performance.now()) / 1000,
          ease: motionTokens.ease }}
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
            durationMs={narrative.mode === 'reduced' ? 0 : narrative.phase === 'flying' ? timeline.frameMs : undefined}
            onLock={() => {
              if (g.title === focusedTitleRef.current && !dragging.current && !suspended && !closing && isPresent) catalogueLock.lock(g.title);
            }}
            onClick={() => {
              if (grid) { playGame(g); return; }
              if (dragged.current) return;
              if (i === active) playGame(g);
              else setActive(i);
            }}
          />
        ))}
        {loading && <div className="coverflow__loading">Loading catalogue…</div>}
        {!loading && list.length === 0 && <div className="coverflow__loading" role="status">{games.length === 0 ? 'New titles are on the way.' : 'No titles in this category'}</div>}
      </motion.div>

      {/* Reserved banner zone (carousel only) — fixed height so the deck never
          resizes and the fan never shifts vertically, whether or not the focused
          game shows a banner. Re-keyed by id so the art crossfades on focus. */}
      {!grid && (
        <div className="coverflow__hero-zone">
          {activeGame && <HeroBanner key={activeGame.id} game={activeGame} onPlay={() => playGame(activeGame)} />}
        </div>
      )}

      {!grid && (
        <nav className="coverflow__nav" aria-label="Browse games">
          <button type="button" className="coverflow__arrow" data-cursor="PREV" aria-label="Previous" onClick={() => go(-1)} disabled={active === 0}>
            <ChevronLeft size={22} />
          </button>
          <span className="coverflow__count">{loading ? '— / —' : `${list.length ? active + 1 : 0} / ${list.length}`}</span>
          <button type="button" className="coverflow__arrow" data-cursor="NEXT" aria-label="Next" onClick={() => go(1)} disabled={active >= list.length - 1}>
            <ChevronRight size={22} />
          </button>
        </nav>
      )}
    </motion.div>
    </PanelMotionContext.Provider>
  );
}
