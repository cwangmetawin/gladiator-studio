import { Suspense, lazy, useEffect, useLayoutEffect, useId, useMemo, useState, useCallback, useRef, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, MotionConfig, useIsPresent } from 'framer-motion';
import '@/styles/index.css';
import { X, ExternalLink, Maximize2 } from 'lucide-react';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { fetchGameData, GLADIATOR_SLOTS, METAWIN_ORIGINALS } from '@/api/gameData';
import { CatalogueStatsProvider } from '@/shared/content/StudioStats';
import type { GameData } from '@/shared/types/game';
import { StarfieldCanvas } from '@/features/starfield/StarfieldCanvas';
import { ConstellationDoors } from '@/features/starfield/ConstellationDoors';
import { useGameSky } from '@/features/starfield/useGameSky';
import { isSceneCovered } from '@/features/starfield/renderLoop';
import { useFeederSocket } from '@/features/live-feed/useFeederSocket';
import { sceneEvents } from '@/shared/utils/sceneEvents';
import { AgeGateLayer } from '@/shared/components/AgeGate';
import { useAgeGate } from '@/shared/components/ageGateState';
import { soundEngine } from '@/shared/utils/soundEngine';
import { preloadScene, scheduleScenePreload } from '@/shared/utils/preloadScene';
import { sceneReadiness } from '@/features/starfield/sceneReadiness';
import { homeReveal } from '@/shared/brand/homeReveal';
import { NAV_ITEMS } from '@/features/arena/navItems';
import { bindTransitionSounds } from '@/shared/audio/transitionSound';
import { useClientArea } from '@/features/partner/useClientArea';
import { PartnerPending } from '@/features/partner/PartnerPending';
import { PartnerDialog } from '@/features/partner/PartnerDialog';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { useDialogFocus } from '@/shared/hooks/useDialogFocus';
import { FilmGrain } from '@/shared/ui/FilmGrain';
import { CursorFX } from '@/shared/ui/CursorFX';
import { LiveTicker } from '@/features/live-feed/LiveTicker';
import { ContentPanel } from '@/shared/motion/ContentPanel';
import { transitionStore } from '@/shared/motion/transitionStore';
import { useTransition } from '@/shared/motion/useTransition';
import { isPanelId, type PanelId } from '@/shared/motion/transition';
import { motionTokens, transitionTimeline, type MotionMode } from '@/shared/motion/tokens';

const LiveActivityFeed = lazy(() => import('@/features/live-feed/LiveActivityFeed').then(m => ({ default: m.LiveActivityFeed })));
const GameShowcase = lazy(() => import('@/features/games/GameShowcase').then(m => ({ default: m.GameShowcase })));
const GameCoverflow = lazy(() => import('@/features/games/GameCoverflow').then(m => ({ default: m.GameCoverflow })));
const AboutSection = lazy(() => import('@/features/about/AboutSection').then(m => ({ default: m.AboutSection })));
const TeamSection = lazy(() => import('@/features/team/TeamSection').then(m => ({ default: m.TeamSection })));
const JourneySection = lazy(() => import('@/features/journey/JourneySection').then(m => ({ default: m.JourneySection })));
const CareersSection = lazy(() => import('@/features/careers/CareersSection').then(m => ({ default: m.CareersSection })));
const ContactSection = lazy(() => import('@/features/contact/ContactSection').then(m => ({ default: m.ContactSection })));
const loadPartnerArea = () => import('@/features/partner/PartnerArea');
const PartnerArea = lazy(() => loadPartnerArea().then(m => ({ default: m.PartnerArea })));
// The first screen (3D emblem's page, headline, top bar) loads after the age gate answers, so none of it is in the gate's bundle.
const ArenaJourney = lazy(() => import('@/features/arena/home').then(m => ({ default: m.ArenaJourney })));
const TopBar = lazy(() => import('@/features/arena/home').then(m => ({ default: m.TopBar })));

// ─── Layout constants ───────────────────────────────────────────────────────
const BAR_H = 56;
const HOLO = 'var(--color-holo-500)';
const HOLO_DIM = 'var(--color-line)';

// Panels that slide in from the left; everything else slides from the right.
const LEFT_PANELS: readonly PanelId[] = ['games', 'about', 'team', 'journey'];

// ─── Content panel (sliding glass drawer) ─────────────────────────────────────

function PanelSpinner() {
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: HOLO }}>
      <div
        aria-hidden="true"
        className="animate-spin"
        style={{ width: 24, height: 24, border: `2px solid ${HOLO_DIM}`, borderTopColor: HOLO, borderRadius: '50%' }}
      />
      <span className="sr-only">Loading</span>
    </div>
  );
}

// ─── Desktop command bar ──────────────────────────────────────────────────────

interface CommandBarProps {
  readonly activePanel: PanelId;
  readonly onActivate: (id: PanelId) => void;
  readonly visible: boolean;
  readonly durationMs: number;
}

function CommandBar({ activePanel, onActivate, visible, durationMs }: CommandBarProps) {
  const isPresent = useIsPresent();
  return (
    <motion.nav
      aria-label="Primary"
      className="shell-bar"
      initial={{ y: BAR_H, opacity: 0 }}
      animate={visible ? { y: 0, opacity: 1 } : { y: BAR_H, opacity: 0 }}
      exit={{ y: BAR_H, opacity: 0 }}
      transition={{ duration: isPresent ? durationMs / 1000 : 0, ease: motionTokens.ease }}
      inert={!visible}
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        minHeight: BAR_H,
        borderTop: `1px solid ${HOLO_DIM}`,
        display: 'flex', alignItems: 'center',
        paddingInline: 'clamp(14px, 3vw, 26px)',
        gap: 18,
      }}
    >
      <div className="cmd-nav-scroll" style={{ display: 'flex', alignItems: 'center', flex: 1, overflowX: 'auto' }}>
        {NAV_ITEMS.map(({ label, panelId }) => (
          <button
            key={panelId}
            type="button"
            className="navbtn"
            aria-pressed={activePanel === panelId}
            onClick={() => onActivate(panelId)}
            onMouseEnter={() => soundEngine.hover()}
          >
            {label}
          </button>
        ))}
      </div>

      <span className="readout" style={{ flexShrink: 0, color: 'var(--color-text-dim)' }}>
        © 2026 Gladiator Studio
        <span aria-hidden="true">·</span>
        <span>A MetaWin Company</span>
      </span>
    </motion.nav>
  );
}

// ─── Mobile drawer ─────────────────────────────────────────────────────────────

interface MobileDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly activePanel: PanelId;
  readonly onActivate: (id: PanelId) => void;
  /** The top bar hides its Client Area button on phones — this is the mobile route in. */
  readonly onClientArea: (opener: HTMLButtonElement) => void;
  readonly motionMode: MotionMode;
}

function MobileDrawer({ isOpen, onClose, activePanel, onActivate, onClientArea, motionMode }: MobileDrawerProps) {
  const titleId = useId();
  const isolationRef = useRef<HTMLDivElement>(null);
  const dialogRef = useDialogFocus<HTMLElement>({ active: isOpen, onEscape: onClose, isolationRef });
  const durationMs = motionMode === 'reduced' ? motionTokens.reducedFadeMs : motionTokens.phonePanelMs;
  const handleSelect = useCallback((id: PanelId) => {
    // Selecting the already-open section keeps it open (handleActivate toggles).
    if (id !== activePanel) onActivate(id);
    onClose();
  }, [activePanel, onActivate, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div ref={isolationRef}>
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: durationMs / 1000, ease: motionTokens.ease }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(3,4,8,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          />
          <motion.nav
            ref={dialogRef}
            key="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }}
            transition={{ duration: durationMs / 1000, ease: motionTokens.ease,
              x: { duration: motionMode === 'reduced' ? 0 : durationMs / 1000, ease: motionTokens.ease } }}
            className="glass"
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 61, width: 280,
              borderRadius: 0, borderRight: 'none', borderTop: 'none', borderBottom: 'none',
              display: 'flex', flexDirection: 'column',
              paddingTop: 'env(safe-area-inset-top, 12px)', paddingBottom: 'env(safe-area-inset-bottom, 12px)',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 18px 14px', borderBottom: `1px solid ${HOLO_DIM}` }}>
              <span id={titleId} className="eyebrow"><span className="eyebrow__dot" aria-hidden="true" />Navigation</span>
              <button type="button" onClick={onClose} className="icon-btn" aria-label="Close menu">
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', overscrollBehavior: 'contain' }}>
              {NAV_ITEMS.map(({ label, panelId, icon: Icon }) => (
                <button
                  key={panelId}
                  type="button"
                  className="drawer-item"
                  aria-pressed={activePanel === panelId}
                  onClick={() => handleSelect(panelId)}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 18px', borderTop: `1px solid ${HOLO_DIM}` }}>
              <button
                type="button"
                className="btn btn--primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={event => onClientArea(event.currentTarget)}
              >
                Client Area
                <ExternalLink size={12} aria-hidden="true" />
              </button>
              <span className="readout" style={{ color: 'var(--color-text-dim)' }}>© 2026 Gladiator Studio</span>
            </div>
          </motion.nav>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Game iframe overlay ───────────────────────────────────────────────────────

interface GameOverlayProps {
  readonly game: { readonly title: string; readonly link: string };
  readonly isMobile: boolean;
  readonly onClose: () => void;
}

function GameOverlay({ game, isMobile, onClose }: GameOverlayProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const isPresent = useIsPresent();
  const dialogRef = useDialogFocus<HTMLDivElement>({ active: isPresent, onEscape: onClose, initialFocusRef: closeRef });
  const returnToControls = () => closeRef.current?.focus({ preventScroll: true });
  if (isMobile) {
    return (
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', zIndex: 10000, background: '#000', overflow: 'hidden' }}>
        <span id={titleId} className="sr-only">{game.title}</span>
        <span className="sr-only" tabIndex={0} aria-hidden="true" data-focus-guard="" onFocus={returnToControls} />
        <iframe
          src={game.link}
          title={game.title}
          style={{ position: 'absolute', inset: 0, width: '100vw', height: '100dvh', border: 'none' }}
          allow="fullscreen; autoplay; screen-orientation"
          allowFullScreen
        />
        <span className="sr-only" tabIndex={0} aria-hidden="true" data-focus-guard="" onFocus={returnToControls} />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="icon-btn"
          aria-label="Close game"
          style={{ position: 'absolute', top: 'calc(10px + env(safe-area-inset-top, 0px))', right: 10, zIndex: 10001 }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(3,4,8,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="glass"
        data-game-container=""
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{ width: '92vw', maxWidth: 1400, aspectRatio: '16 / 9', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: `1px solid ${HOLO_DIM}`, flexShrink: 0 }}>
          <span id={titleId} className="eyebrow"><span className="eyebrow__dot animate-electric-pulse" aria-hidden="true" />{game.title}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="icon-btn"
              aria-label="Toggle fullscreen"
              onClick={(e) => {
                e.stopPropagation();
                const container = e.currentTarget.closest('[data-game-container]') as HTMLElement | null;
                if (!container) return;
                if (document.fullscreenElement) document.exitFullscreen();
                else container.requestFullscreen();
              }}
            >
              <Maximize2 size={15} aria-hidden="true" />
            </button>
            <button ref={closeRef} type="button" className="icon-btn" aria-label="Close game" onClick={onClose}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
        {/* Focus leaving the cross-origin game (Tab past its end, or Shift+Tab before its start) lands on these guards. */}
        <span className="sr-only" tabIndex={0} aria-hidden="true" data-focus-guard="" onFocus={returnToControls} />
        <iframe
          src={game.link}
          title={game.title}
          style={{ flex: 1, border: 'none', width: '100%', background: '#000' }}
          allow="fullscreen; autoplay"
          allowFullScreen
        />
        <span className="sr-only" tabIndex={0} aria-hidden="true" data-focus-guard="" onFocus={returnToControls} />
      </motion.div>
    </motion.div>
  );
}

// ─── App root ──────────────────────────────────────────────────────────────────

export function App() {
  const { verified, verify, reject, showGate } = useAgeGate();
  // The first screen is released as the age gate starts to fade (or at once with no gate); until then the site
  // holds only the sky and its 3D emblem, which the gate hides.
  const released = useSyncExternalStore(homeReveal.subscribe, () => homeReveal.getSnapshot() !== null, () => false);
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [playingGame, setPlayingGame] = useState<{ title: string; link: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { clientArea, clientOpenerRef, openClientArea, closeClientArea } = useClientArea();
  const sceneReady = useSyncExternalStore(sceneReadiness.subscribe, sceneReadiness.getSnapshot, sceneReadiness.getSnapshot);
  const isMobile = useIsMobile();
  const transition = useTransition(isMobile);
  const skyRootRef = useGameSky(verified && released, isMobile, transition.mode === 'reduced');
  const activePanel = transition.panel;
  const timeline = transitionTimeline(transition.mode, transition.kind);
  const playTimerRef = useRef<number | null>(null);
  const panelOpenerRef = useRef<HTMLElement | null>(null);
  const previousPhase = useRef(transition.phase);
  useLayoutEffect(() => {
    const root = document.getElementById('root');
    if (sceneReady) root?.setAttribute('data-scene-ready', sceneReady);
    else root?.removeAttribute('data-scene-ready');
  }, [sceneReady]);
  useEffect(() => soundEngine.initGestureUnlock(), []);
  useEffect(() => bindTransitionSounds(transitionStore, soundEngine), []);
  useEffect(() => scheduleScenePreload(), []);
  useEffect(() => { if (verified) preloadScene(); }, [verified]);
  useEffect(() => {
    // Warm the small editorial page after the gate; a failed speculative load can retry on open.
    if (released) void loadPartnerArea().catch(() => {});
  }, [released]);
  const handleVerify = useCallback(() => {
    preloadScene();
    soundEngine.unlock();
    soundEngine.ignite();
    verify();
  }, [verify]);
  useEffect(() => { if (released) soundEngine.startAmbient(); }, [released]);
  useLayoutEffect(() => {
    // Mobile menu visibility is restored in this commit, after dialog cleanup.
    if (transition.phase === 'idle' && previousPhase.current !== 'idle') {
      panelOpenerRef.current?.focus({ preventScroll: true });
    }
    previousPhase.current = transition.phase;
  }, [transition.phase]);

  const feed = useFeederSocket();
  const { events, isConnected } = feed;

  const cancelPendingPlay = useCallback(() => {
    if (playTimerRef.current === null) return;
    window.clearTimeout(playTimerRef.current);
    playTimerRef.current = null;
    sceneEvents.emitBlackhole(false);
  }, []);

  const rememberPanelOpener = useCallback((id: PanelId) => {
    if (id === 'none' || (transitionStore.getSnapshot().phase !== 'idle' && panelOpenerRef.current !== null)) return;
    const focused = document.activeElement;
    panelOpenerRef.current = focused instanceof HTMLElement ? focused : null;
  }, []);

  const handleFocusGame = useCallback((title: string) => {
    if (!title.trim()) return;
    cancelPendingPlay();
    rememberPanelOpener('games');
    transitionStore.focusGame(title);
  }, [cancelPendingPlay, rememberPanelOpener]);

  useEffect(() => {
    const handler = (event: Event): void => {
      const title: unknown = (event as CustomEvent<unknown>).detail;
      if (typeof title === 'string') handleFocusGame(title);
    };
    window.addEventListener('focus-game', handler);
    return () => window.removeEventListener('focus-game', handler);
  }, [handleFocusGame]);

  useEffect(() => {
    fetchGameData().then(setGameData);
  }, []);

  // The ring and catalogue share the same player. A ring demo opens directly,
  // while a desktop catalogue demo retains its existing black-hole transition.
  const handlePlayGame = useCallback((game: { title: string; link: string }) => {
    cancelPendingPlay();
    if (isMobile || transitionStore.getSnapshot().target === 'none') {
      setPlayingGame(game);
      return;
    }
    sceneEvents.emitBlackhole(true);
    playTimerRef.current = window.setTimeout(() => {
      playTimerRef.current = null;
      setPlayingGame(game);
    }, 1800);
  }, [isMobile, cancelPendingPlay]);

  // Play-game events from GameCard
  useEffect(() => {
    const handler = (e: CustomEvent<{ title: string; link: string }>) => {
      if (activePanel !== 'games' || transitionStore.getSnapshot().target !== 'games') return;
      handlePlayGame(e.detail);
    };
    window.addEventListener('play-game' as string, handler as EventListener);
    return () => {
      window.removeEventListener('play-game' as string, handler as EventListener);
      cancelPendingPlay();
    };
  }, [activePanel, handlePlayGame, cancelPendingPlay]);

  // Open-panel events from Hero buttons
  useEffect(() => {
    const handler = (e: CustomEvent<string>) => {
      if (!isPanelId(e.detail)) return;
      cancelPendingPlay();
      rememberPanelOpener(e.detail);
      transitionStore.request(e.detail);
    };
    window.addEventListener('open-panel' as string, handler as EventListener);
    return () => window.removeEventListener('open-panel' as string, handler as EventListener);
  }, [cancelPendingPlay, rememberPanelOpener]);

  // Close panel / game with Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      cancelPendingPlay();
      if (clientArea !== 'closed') closeClientArea();
      else if (playingGame) { sceneEvents.emitBlackhole(false); setPlayingGame(null); }
      else if (transitionStore.getSnapshot().target !== 'none') transitionStore.request('none');
      else if (drawerOpen) setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playingGame, drawerOpen, clientArea, closeClientArea, cancelPendingPlay]);

  const handleActivate = useCallback((id: PanelId) => {
    cancelPendingPlay();
    rememberPanelOpener(id);
    const next = transitionStore.getSnapshot().target === id ? 'none' : id;
    transitionStore.request(next);
  }, [cancelPendingPlay, rememberPanelOpener]);

  const handleClose = useCallback(() => {
    cancelPendingPlay();
    transitionStore.request('none');
  }, [cancelPendingPlay]);

  const closeGame = useCallback(() => {
    cancelPendingPlay();
    sceneEvents.emitBlackhole(false);
    setPlayingGame(null);
  }, [cancelPendingPlay]);

  const activeSide: 'left' | 'right' = LEFT_PANELS.includes(activePanel) ? 'left' : 'right';

  // Desktop Games opens the carousel; phones retain the featured card and grid.
  const showCoverflow = activePanel === 'games' && !isMobile;
  const allGames = useMemo(() => {
    const all = [...(gameData?.slotGames ?? []), ...(gameData?.miniGames ?? [])];
    return all.slice().sort((a, b) => b.timeline.localeCompare(a.timeline));
  }, [gameData]);

  // Share the published catalogue (curated roster while loading), including RTPs.
  const catalogue = useMemo(() => gameData ?? {
    slotGames: GLADIATOR_SLOTS, miniGames: METAWIN_ORIGINALS,
  }, [gameData]);

  // The gate keeps its slot across verification: it stays mounted above the site while the site's sky
  // and 3D emblem are built underneath, then fades into the first screen.
  const topBarCovered = (isMobile && activePanel !== 'none') || showCoverflow;
  return (
    <>
    {verified && (
    <CatalogueStatsProvider catalogue={catalogue}>
    <MotionConfig reducedMotion="user">
    <div ref={skyRootRef} data-arena-track="" data-transition={transition.phase} data-transition-target={transition.target}
      data-scene-ready={sceneReady ?? undefined}
      data-trail="0.00" data-sky-game="" data-constellations="0"
      style={{ position: 'relative', height: released ? '290dvh' : '100dvh', background: 'var(--color-void-900)' }} aria-label="Gladiator Studio">
      {/* Native document scroll supplies 0.9 screens of dive and one screen of arena arrival. */}
      <div style={{ position: 'sticky', top: 0, height: '100dvh', overflow: 'clip' }}>
      {/* 3D scene — always behind everything */}
      <StarfieldCanvas suspended={isSceneCovered(playingGame !== null, clientArea !== 'closed', isMobile, activePanel)} />

      {released && <>
      <a href="#main" className="skip-to-content">Skip to content</a>

      {/* Holographic display overlay — subtle scanlines over the 3D backdrop */}
      <div className="fx-holo" aria-hidden="true" />

      {/* Cinematic film-grain overlay (desktop only; self-disables for reduced-motion) */}
      {!isMobile && <FilmGrain />}
      {!isMobile && <CursorFX />}

      <main id="main">
        {/* Keep the hidden hero mounted so a closing catalogue can restore its opener. It arrives by its own
            keyframes (the headline's letters), not by this fade, so it starts fully shown. */}
        <motion.div
          key="hero-full"
          initial={false}
          animate={transition.hubVisible
            ? { opacity: 1, visibility: 'visible' }
            : { opacity: 0, transitionEnd: { visibility: 'hidden' } }}
          // The request captures the opener before the presented panel hides the hub.
          inert={activePanel !== 'none'}
          transition={{ duration: (transition.hubVisible ? timeline.hubMs : transition.mode === 'desktop' ? motionTokens.hubDimMs : timeline.frameMs) / 1000,
            delay: transition.hubVisible ? 0 : timeline.feedbackMs / 1000, ease: motionTokens.ease }}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, visibility: transition.hubVisible ? 'visible' : undefined }}
        >
          <Suspense fallback={null}>
            <ArenaJourney panelSide={activeSide} active={transition.hubVisible} target={transition.target}
              scrollLocked={transition.phase !== 'idle' || drawerOpen || playingGame !== null || clientArea !== 'closed'} onPlayGame={handlePlayGame} />
          </Suspense>
        </motion.div>
      </main>

      <ConstellationDoors active={transition.phase === 'idle' && !drawerOpen && playingGame === null && clientArea === 'closed'}
        phone={isMobile} games={allGames} onFocusGame={handleFocusGame} />

      {/* Top bar: the brand, the seven sections, sound and Client Area (a menu button on phones). It stays
          mounted so its arrival never replays; it is hidden on mobile when a panel is open, and for the
          full-screen coverflow (whose own header carries the tabs + close). */}
      <Suspense fallback={null}>
        <TopBar isConnected={isConnected} isMobile={isMobile} target={transition.target} covered={topBarCovered}
          menuVisible={clientArea === 'closed' && transition.phase === 'idle'}
          onActivate={handleActivate} onClientArea={openClientArea}
          onMenu={() => { rememberPanelOpener('about'); soundEngine.click(); setDrawerOpen(true); }} />
      </Suspense>

      {/* Homepage live-wins ticker — horizontal crawl across the hero's bottom edge.
          Shares App's single feeder socket (no second connection). */}
      {transition.phase === 'idle' && <LiveTicker events={events} isConnected={isConnected} />}

      {/* Translucent catalogue — desktop Games */}
      <AnimatePresence>
        {showCoverflow && (
          <Suspense fallback={null}>
            <GameCoverflow games={allGames} loading={gameData === null} onClose={handleClose} suspended={playingGame !== null} returnFocusRef={panelOpenerRef} narrative={transition} />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Sliding content panel (other sections + mobile Games) */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40 }}>
        {activePanel !== 'none' && !showCoverflow && (
          <ContentPanel panelId={activePanel} side={activeSide} label={NAV_ITEMS.find(item => item.panelId === activePanel)?.label ?? activePanel}
            index={NAV_ITEMS.findIndex(item => item.panelId === activePanel) + 1} count={NAV_ITEMS.length}
            onClose={handleClose} isMobile={isMobile} onMenu={() => setDrawerOpen(true)} returnFocusRef={panelOpenerRef} transition={transition}>
            <ErrorBoundary>
              <Suspense fallback={<PanelSpinner />}>
                {activePanel === 'games' && (
                  <GameShowcase slotGames={gameData?.slotGames ?? []} miniGames={gameData?.miniGames ?? []} loading={gameData === null}
                    focusGame={transition.focusGame} reducedMotion={transition.mode === 'reduced'} />
                )}
                {activePanel === 'about' && <AboutSection />}
                {activePanel === 'team' && <TeamSection />}
                {activePanel === 'journey' && <JourneySection />}
                {activePanel === 'live' && <LiveActivityFeed {...feed} />}
                {activePanel === 'careers' && <CareersSection />}
                {activePanel === 'contact' && <ContactSection />}
              </Suspense>
            </ErrorBoundary>
          </ContentPanel>
        )}
      </div>

      {/* Navigation */}
      {isMobile ? (
        <>
          <MobileDrawer
            isOpen={drawerOpen}
            motionMode={transition.mode}
            onClose={() => setDrawerOpen(false)}
            activePanel={transition.target}
            onActivate={handleActivate}
            onClientArea={openClientArea}
          />
        </>
      ) : (
        // Footer nav is redundant with the top bar on home — show it only
        // while a panel is open, where it's the quick way to switch sections.
        <AnimatePresence>
          {transition.phase !== 'idle' && (
            <CommandBar key="cmdbar" activePanel={transition.target} onActivate={handleActivate}
              visible={!transition.hubVisible} durationMs={transition.hubVisible ? timeline.hubMs : timeline.frameMs} />
          )}
        </AnimatePresence>
      )}

      {/* Game overlay */}
      <AnimatePresence>
        {playingGame && (
          <GameOverlay key="game-overlay" game={playingGame} isMobile={isMobile} onClose={closeGame} />
        )}
      </AnimatePresence>

      {/* The drawer stays mounted below the modal so its Client Area trigger can receive focus on close. */}
      {clientArea !== 'closed' && (
        <PartnerDialog onClose={closeClientArea} returnFocusRef={clientOpenerRef} events={events} isConnected={isConnected}>
          {titleId => (
            <ErrorBoundary fallback={<PartnerPending titleId={titleId} failed />}>
              <Suspense fallback={<PartnerPending titleId={titleId} />}>
                <PartnerArea titleId={titleId} />
              </Suspense>
            </ErrorBoundary>
          )}
        </PartnerDialog>
      )}
      </>}
      </div>
    </div>
    </MotionConfig>
    </CatalogueStatsProvider>
    )}
    <AgeGateLayer verified={verified} rejected={!verified && !showGate} onVerify={handleVerify} onReject={reject} />
    </>
  );
}
