import { Suspense, lazy, useEffect, useLayoutEffect, useId, useMemo, useState, useCallback, useRef, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, MotionConfig, useIsPresent } from 'framer-motion';
import '@/styles/index.css';
import { X, ExternalLink, Maximize2, Menu } from 'lucide-react';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { fetchGameData, GLADIATOR_SLOTS, METAWIN_ORIGINALS } from '@/api/gameData';
import { CatalogueStatsProvider } from '@/shared/content/StudioStats';
import type { GameData } from '@/shared/types/game';
import { StarfieldCanvas } from '@/features/starfield/StarfieldCanvas';
import { ConstellationDoors } from '@/features/starfield/ConstellationDoors';
import { useGameSky } from '@/features/starfield/useGameSky';
import { isSceneCovered } from '@/features/starfield/renderLoop';
import { useFeederSocket } from '@/features/live-feed/useFeederSocket';
import { AgeGateLayer } from '@/shared/components/AgeGate';
import { useAgeGate } from '@/shared/components/ageGateState';
import { soundEngine } from '@/shared/utils/soundEngine';
import { preloadScene, scheduleScenePreload } from '@/shared/utils/preloadScene';
import { sceneReadiness } from '@/features/starfield/sceneReadiness';
import { homeReveal } from '@/shared/brand/homeReveal';
import { NAV_ITEMS } from '@/features/arena/navItems';
import { useClientArea } from '@/features/partner/useClientArea';
import { PartnerPending } from '@/features/partner/PartnerPending';
import { PartnerDialog } from '@/features/partner/PartnerDialog';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { useDialogFocus } from '@/shared/hooks/useDialogFocus';
import { FilmGrain } from '@/shared/ui/FilmGrain';
import { CursorFX } from '@/shared/ui/CursorFX';
import { LiveTicker } from '@/features/live-feed/LiveTicker';
import { ArenaPageShell } from '@/features/arena-page/ArenaPageShell';
import { useArenaPage } from '@/features/arena-page/useArenaPage';
import { ArenaSectionArea } from '@/features/arena-page/ArenaSectionArea';
import { useTransition } from '@/shared/motion/useTransition';
import { isPanelId, type PanelId } from '@/shared/motion/transition';
import { motionTokens, type MotionMode } from '@/shared/motion/tokens';

const loadPartnerArea = () => import('@/features/partner/PartnerArea');
const PartnerArea = lazy(() => loadPartnerArea().then(m => ({ default: m.PartnerArea })));
// The first screen (3D emblem's page, headline, top bar) loads after the age gate answers, so none of it is in the gate's bundle.
const ArenaJourney = lazy(() => import('@/features/arena/home').then(m => ({ default: m.ArenaJourney })));
const TopBar = lazy(() => import('@/features/arena/home').then(m => ({ default: m.TopBar })));

// ─── Layout constants ───────────────────────────────────────────────────────
const HOLO_DIM = 'var(--color-line)';

// ─── Mobile drawer ─────────────────────────────────────────────────────────────

interface MobileDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly activePanel: PanelId;
  readonly onActivate: (id: PanelId, opener?: HTMLButtonElement) => void;
  /** The top bar hides its Client Area button on phones — this is the mobile route in. */
  readonly onClientArea: (opener: HTMLButtonElement) => void;
  readonly motionMode: MotionMode;
}

function MobileDrawer({ isOpen, onClose, activePanel, onActivate, onClientArea, motionMode }: MobileDrawerProps) {
  const titleId = useId();
  const isolationRef = useRef<HTMLDivElement>(null);
  const dialogRef = useDialogFocus<HTMLElement>({ active: isOpen, onEscape: onClose, isolationRef });
  const durationMs = motionMode === 'reduced' ? motionTokens.reducedFadeMs : motionTokens.phonePanelMs;
  // Keep the drawer and its original trigger mounted under the page, as for Client Area.
  const handleSelect = (id: PanelId, opener: HTMLButtonElement) => onActivate(id, opener);

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
              <span id={titleId} className="eyebrow"><Menu size={16} aria-hidden="true" />Navigation</span>
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
                  onClick={event => handleSelect(panelId, event.currentTarget)}
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
  const { page, openerRef, focusGame, openPage, closePage } = useArenaPage();
  const sceneReady = useSyncExternalStore(sceneReadiness.subscribe, sceneReadiness.getSnapshot, sceneReadiness.getSnapshot);
  const isMobile = useIsMobile();
  const transition = useTransition(isMobile);
  const skyRootRef = useGameSky(verified && released, isMobile, transition.mode === 'reduced');
  useLayoutEffect(() => {
    const root = document.getElementById('root');
    if (sceneReady) root?.setAttribute('data-scene-ready', sceneReady);
    else root?.removeAttribute('data-scene-ready');
  }, [sceneReady]);
  useEffect(() => soundEngine.initGestureUnlock(), []);
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
  const feed = useFeederSocket();
  const { events, isConnected } = feed;

  const handleFocusGame = useCallback((title: string, opener?: HTMLButtonElement) => {
    if (title.trim()) openPage('games', opener, title);
  }, [openPage]);

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

  // The hall and all catalogue demos keep App's existing iframe overlay.
  const handlePlayGame = useCallback((game: { title: string; link: string }) => setPlayingGame(game), []);

  const handleActivate = useCallback((id: PanelId, opener?: HTMLButtonElement) => {
    if (id === 'none') closePage();
    else openPage(id, opener);
  }, [openPage, closePage]);

  // Homepage, hall and in-copy links all share the same persistent page controller.
  useEffect(() => {
    const handler = (event: Event) => {
      const id: unknown = (event as CustomEvent<unknown>).detail;
      if (typeof id === 'string' && isPanelId(id)) handleActivate(id);
    };
    window.addEventListener('open-panel', handler);
    return () => window.removeEventListener('open-panel', handler);
  }, [handleActivate]);

  const closeGame = useCallback(() => setPlayingGame(null), []);

  const allGames = useMemo(() => {
    const all = [...(gameData?.slotGames ?? GLADIATOR_SLOTS), ...(gameData?.miniGames ?? METAWIN_ORIGINALS)];
    return all.slice().sort((a, b) => b.timeline.localeCompare(a.timeline));
  }, [gameData]);

  // Share the published catalogue (curated roster while loading), including RTPs.
  const catalogue = useMemo(() => gameData ?? {
    slotGames: GLADIATOR_SLOTS, miniGames: METAWIN_ORIGINALS,
  }, [gameData]);

  // The gate keeps its slot across verification: it stays mounted above the site while the site's sky
  // and 3D emblem are built underneath, then fades into the first screen.
  const topBarCovered = page !== null;
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
      <StarfieldCanvas suspended={isSceneCovered(playingGame !== null, clientArea !== 'closed' || page !== null)} />

      {released && <>
      <a href="#main" className="skip-to-content">Skip to content</a>

      {/* Holographic display overlay — subtle scanlines over the 3D backdrop */}
      <div className="fx-holo" aria-hidden="true" />

      {/* Cinematic film-grain overlay (desktop only; self-disables for reduced-motion) */}
      {!isMobile && <FilmGrain />}
      {!isMobile && <CursorFX />}

      <main id="main">
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          <Suspense fallback={null}>
            <ArenaJourney active target="none"
              scrollLocked={page !== null || drawerOpen || playingGame !== null || clientArea !== 'closed'} onPlayGame={handlePlayGame} />
          </Suspense>
        </div>
      </main>

      <ConstellationDoors active={page === null && !drawerOpen && playingGame === null && clientArea === 'closed'}
        phone={isMobile} games={allGames} onFocusGame={handleFocusGame} />

      {/* Keep the homepage bar mounted so its original triggers can receive focus on close. */}
      <Suspense fallback={null}>
        <TopBar isConnected={isConnected} isMobile={isMobile} target={page ?? 'none'} covered={topBarCovered}
          menuVisible={clientArea === 'closed' && page === null}
          onActivate={handleActivate} onClientArea={openClientArea}
          onMenu={() => { soundEngine.click(); setDrawerOpen(true); }} />
      </Suspense>

      {/* Homepage live-wins ticker — horizontal crawl across the hero's bottom edge.
          Shares App's single feeder socket (no second connection). */}
      {page === null && clientArea === 'closed' && <LiveTicker events={events} isConnected={isConnected} />}

      {isMobile && <MobileDrawer isOpen={drawerOpen} motionMode={transition.mode} onClose={() => setDrawerOpen(false)}
        activePanel={page ?? 'none'} onActivate={handleActivate} onClientArea={openClientArea} />}

      {page !== null && (
        <ArenaPageShell page={page} onClose={closePage} onNavigate={openPage} returnFocusRef={openerRef} events={events} isConnected={isConnected}>
          {titleId => <ArenaSectionArea page={page} titleId={titleId} games={allGames} loading={gameData === null}
            focusGame={focusGame} onPlayGame={handlePlayGame} feed={feed} />}
        </ArenaPageShell>
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
