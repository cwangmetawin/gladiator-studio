import { Suspense, lazy, useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import {
  X, ExternalLink, Volume2, VolumeOff, Menu, Maximize2,
  Gamepad2, Info, Users, Map, Radio, Briefcase, Mail,
} from 'lucide-react';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { Hero } from '@/features/hero/Hero';
import { fetchGameData } from '@/api/gameData';
import type { GameData } from '@/shared/types/game';
import { StarfieldCanvas } from '@/features/starfield/StarfieldCanvas';
import { useFeederSocket } from '@/features/live-feed/useFeederSocket';
import { sceneEvents } from '@/shared/utils/sceneEvents';
import { CLIENT_AREA_URL } from '@/shared/constants/urls';
import { AgeGate, useAgeGate } from '@/shared/components/AgeGate';
import { WarpIntro } from '@/shared/components/WarpIntro';
import { soundEngine } from '@/shared/utils/soundEngine';
import { useIsMobile } from '@/shared/hooks/useIsMobile';

const LiveActivityFeed = lazy(() => import('@/features/live-feed/LiveActivityFeed').then(m => ({ default: m.LiveActivityFeed })));
const GameShowcase = lazy(() => import('@/features/games/GameShowcase').then(m => ({ default: m.GameShowcase })));
const AboutSection = lazy(() => import('@/features/about/AboutSection').then(m => ({ default: m.AboutSection })));
const TeamSection = lazy(() => import('@/features/team/TeamSection').then(m => ({ default: m.TeamSection })));
const JourneySection = lazy(() => import('@/features/journey/JourneySection').then(m => ({ default: m.JourneySection })));
const CareersSection = lazy(() => import('@/features/careers/CareersSection').then(m => ({ default: m.CareersSection })));
const ContactSection = lazy(() => import('@/features/contact/ContactSection').then(m => ({ default: m.ContactSection })));

// ─── Layout constants ───────────────────────────────────────────────────────
const BAR_H = 56;
const HOLO = 'var(--color-holo-500)';
const HOLO_DIM = 'var(--color-line)';

type PanelId = 'none' | 'games' | 'about' | 'team' | 'journey' | 'live' | 'careers' | 'contact';

const NAV_ITEMS: readonly { label: string; panelId: PanelId; icon: React.ComponentType<{ size?: number }> }[] = [
  { label: 'Games', panelId: 'games', icon: Gamepad2 },
  { label: 'About', panelId: 'about', icon: Info },
  { label: 'Team', panelId: 'team', icon: Users },
  { label: 'Journey', panelId: 'journey', icon: Map },
  { label: 'Live Feed', panelId: 'live', icon: Radio },
  { label: 'Careers', panelId: 'careers', icon: Briefcase },
  { label: 'Contact', panelId: 'contact', icon: Mail },
] as const;

// Panels that slide in from the left; everything else slides from the right.
const LEFT_PANELS: readonly PanelId[] = ['games', 'about', 'team', 'journey'];

// ─── useValueFlash — brief glow when a live telemetry value changes ───────────

function useValueFlash(value: number): boolean {
  const prevRef = useRef<number>(value);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value;
      setFlashing(true);
      const timer = setTimeout(() => setFlashing(false), 600);
      return () => clearTimeout(timer);
    }
  }, [value]);

  return flashing;
}

// ─── Sound toggle ─────────────────────────────────────────────────────────────

function SoundToggle() {
  const [isMuted, setIsMuted] = useState(() => soundEngine.isMuted());

  const toggle = useCallback(() => {
    setIsMuted(soundEngine.toggleMute());
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      onMouseEnter={() => soundEngine.hover()}
      className="icon-btn"
      aria-label={isMuted ? 'Unmute ambient sound' : 'Mute ambient sound'}
      title={isMuted ? 'Sound off' : 'Sound on'}
      style={{ color: isMuted ? 'var(--color-text-mute)' : HOLO }}
    >
      {isMuted ? <VolumeOff size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
    </button>
  );
}

// ─── Top status bar ─────────────────────────────────────────────────────────

interface StatusBarProps {
  readonly isConnected: boolean;
  readonly totalEvents: number;
  readonly totalAmount: number;
  readonly isMobile: boolean;
}

function StatusBar({ isConnected, totalEvents, totalAmount, isMobile }: StatusBarProps) {
  const wagered = totalAmount >= 1000
    ? `$${(totalAmount / 1000).toFixed(1)}K`
    : `$${totalAmount.toFixed(0)}`;

  const eventsFlashing = useValueFlash(totalEvents);
  const amountFlashing = useValueFlash(totalAmount);

  return (
    <header
      role="banner"
      aria-label="Studio status"
      className="shell-bar"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        minHeight: BAR_H,
        borderBottom: `1px solid ${HOLO_DIM}`,
        display: 'flex', alignItems: 'center',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingInline: 'clamp(14px, 3vw, 26px)',
        gap: isMobile ? 12 : 22,
      }}
    >
      <span className="sys-label" aria-label="Gladiator Studio">
        <span className="sys-label__diamond" aria-hidden="true" />
        Gladiator<span aria-hidden="true" style={{ color: 'var(--color-text-dim)' }}>·</span>Studio
      </span>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 12 : 22 }}>
        <span className="readout" aria-label={isConnected ? 'Live feed connected' : 'Live feed offline'}>
          <span
            aria-hidden="true"
            className={isConnected ? 'animate-live-pulse' : undefined}
            style={{
              width: 7, height: 7, borderRadius: '50%',
              background: isConnected ? 'var(--color-live)' : 'var(--color-ember)',
              boxShadow: `0 0 8px ${isConnected ? 'var(--color-live)' : 'var(--color-ember)'}`,
            }}
          />
          {isConnected ? 'Live' : 'Offline'}
        </span>

        {!isMobile && (
          <>
            <span className="hairline--v" aria-hidden="true" style={{ height: 16 }} />
            <span className="readout">
              Events
              <span className="readout__value" style={{ animation: eventsFlashing ? 'value-glow 0.6s ease-out' : undefined }}>
                {totalEvents.toLocaleString()}
              </span>
            </span>
            <span className="hairline--v" aria-hidden="true" style={{ height: 16 }} />
            <span className="readout">
              Wagered
              <span className="readout__value readout__value--gold" style={{ animation: amountFlashing ? 'value-glow 0.6s ease-out' : undefined }}>
                {wagered}
              </span>
            </span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <SoundToggle />
        {!isMobile && (
          <a
            href={CLIENT_AREA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--primary"
            style={{ minHeight: 36, padding: '0.5rem 1.1rem' }}
            onMouseEnter={() => soundEngine.hover()}
          >
            Client Area
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
      </div>
    </header>
  );
}

// ─── Content panel (sliding glass drawer) ─────────────────────────────────────

interface ContentPanelProps {
  readonly panelId: PanelId;
  readonly side: 'left' | 'right';
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly isMobile: boolean;
}

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

function ContentPanel({ panelId, side, onClose, children, isMobile }: ContentPanelProps) {
  const isLeft = side === 'left';
  const navItem = NAV_ITEMS.find(n => n.panelId === panelId);
  const index = navItem ? NAV_ITEMS.indexOf(navItem) + 1 : 0;
  const label = navItem?.label ?? panelId;
  const indexLabel = `${String(index).padStart(2, '0')} / ${String(NAV_ITEMS.length).padStart(2, '0')}`;

  return (
    <motion.aside
      key={panelId}
      initial={{ x: isLeft ? '-101%' : '101%' }}
      animate={{ x: 0 }}
      exit={{ x: isLeft ? '-101%' : '101%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 38 }}
      aria-label={`${label} panel`}
      className="glass"
      style={{
        position: 'fixed',
        top: isMobile ? 0 : BAR_H,
        bottom: isMobile ? 0 : BAR_H,
        [isLeft ? 'left' : 'right']: 0,
        width: isMobile ? '100vw' : 'clamp(340px, 44vw, 660px)',
        borderRadius: 0,
        [isLeft ? 'borderRight' : 'borderLeft']: `1px solid ${HOLO_DIM}`,
        borderTop: 'none', borderBottom: 'none',
        [isLeft ? 'borderLeft' : 'borderRight']: 'none',
        zIndex: 40,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        pointerEvents: 'auto',
        paddingTop: isMobile ? 'env(safe-area-inset-top, 0px)' : 0,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', borderBottom: `1px solid ${HOLO_DIM}`, flexShrink: 0,
      }}>
        <span className="eyebrow">
          <span className="eyebrow__dot animate-electric-pulse" aria-hidden="true" />
          {label}
          <span style={{ color: 'var(--color-text-dim)', marginLeft: 8 }}>{indexLabel}</span>
        </span>
        <button type="button" onClick={() => { soundEngine.click(); onClose(); }} className="icon-btn" aria-label={`Close ${label} panel`}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      {/* Scrollable content */}
      <div
        className="panel-content"
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', padding: 'clamp(20px, 3vw, 36px)' }}
      >
        {children}
      </div>
    </motion.aside>
  );
}

// ─── Desktop command bar ──────────────────────────────────────────────────────

interface CommandBarProps {
  readonly activePanel: PanelId;
  readonly onActivate: (id: PanelId) => void;
}

function CommandBar({ activePanel, onActivate }: CommandBarProps) {
  return (
    <nav
      aria-label="Primary"
      className="shell-bar"
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
            onClick={() => { soundEngine.click(); onActivate(panelId); }}
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
    </nav>
  );
}

// ─── Mobile drawer ─────────────────────────────────────────────────────────────

interface MobileDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly activePanel: PanelId;
  readonly onActivate: (id: PanelId) => void;
}

function MobileDrawer({ isOpen, onClose, activePanel, onActivate }: MobileDrawerProps) {
  const handleSelect = useCallback((id: PanelId) => {
    onActivate(id);
    onClose();
  }, [onActivate, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(3,4,8,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          />
          <motion.nav
            key="drawer-panel"
            aria-label="Primary"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 36 }}
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
              <span className="eyebrow"><span className="eyebrow__dot" aria-hidden="true" />Navigation</span>
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

            <div style={{ padding: '14px 18px', borderTop: `1px solid ${HOLO_DIM}` }}>
              <span className="readout" style={{ color: 'var(--color-text-dim)' }}>© 2026 Gladiator Studio</span>
            </div>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  );
}

function MobileMenuButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label="Open menu"
      whileTap={{ scale: 0.92 }}
      className="glass"
      style={{
        position: 'absolute',
        bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', right: 20, zIndex: 55,
        width: 54, height: 54, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: HOLO, cursor: 'pointer',
      }}
    >
      <Menu size={22} aria-hidden="true" />
    </motion.button>
  );
}

// ─── Game iframe overlay ───────────────────────────────────────────────────────

interface GameOverlayProps {
  readonly game: { readonly title: string; readonly link: string };
  readonly isMobile: boolean;
  readonly onClose: () => void;
}

function GameOverlay({ game, isMobile, onClose }: GameOverlayProps) {
  if (isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', zIndex: 10000, background: '#000', overflow: 'hidden' }}>
        <iframe
          src={game.link}
          title={game.title}
          style={{ position: 'absolute', inset: 0, width: '100vw', height: '100dvh', border: 'none' }}
          allow="fullscreen; autoplay; screen-orientation"
          allowFullScreen
        />
        <button
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
          <span className="eyebrow"><span className="eyebrow__dot animate-electric-pulse" aria-hidden="true" />{game.title}</span>
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
            <button type="button" className="icon-btn" aria-label="Close game" onClick={onClose}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
        <iframe
          src={game.link}
          title={game.title}
          style={{ flex: 1, border: 'none', width: '100%', background: '#000' }}
          allow="fullscreen; autoplay"
          allowFullScreen
        />
      </motion.div>
    </motion.div>
  );
}

// ─── App root ──────────────────────────────────────────────────────────────────

export function App() {
  const { verified, verify, reject, showGate } = useAgeGate();
  const [introComplete, setIntroComplete] = useState(false);
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [activePanel, setActivePanel] = useState<PanelId>('none');
  const [playingGame, setPlayingGame] = useState<{ title: string; link: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile();

  const { isConnected, totalAmount, gladiatorCount, originalCount } = useFeederSocket();
  const totalEvents = gladiatorCount + originalCount;

  useEffect(() => {
    fetchGameData().then(setGameData);
  }, []);

  // Play-game events from GameCard
  useEffect(() => {
    const handler = (e: CustomEvent<{ title: string; link: string }>) => {
      if (isMobile) {
        setPlayingGame(e.detail);
        return;
      }
      sceneEvents.emitBlackhole(true);
      setTimeout(() => setPlayingGame(e.detail), 1800);
    };
    window.addEventListener('play-game' as string, handler as EventListener);
    return () => window.removeEventListener('play-game' as string, handler as EventListener);
  }, [isMobile]);

  // Open-panel events from Hero buttons
  useEffect(() => {
    const handler = (e: CustomEvent<string>) => setActivePanel(e.detail as PanelId);
    window.addEventListener('open-panel' as string, handler as EventListener);
    return () => window.removeEventListener('open-panel' as string, handler as EventListener);
  }, []);

  // Close panel / game with Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (playingGame) { sceneEvents.emitBlackhole(false); setPlayingGame(null); }
      else if (activePanel !== 'none') { soundEngine.panelClose(); setActivePanel('none'); }
      else if (drawerOpen) setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playingGame, activePanel, drawerOpen]);

  const handleActivate = useCallback((id: PanelId) => {
    setActivePanel(prev => {
      const next = prev === id ? 'none' : id;
      if (next === 'none') soundEngine.panelClose();
      else soundEngine.panelOpen();
      return next;
    });
  }, []);

  const handleClose = useCallback(() => {
    soundEngine.panelClose();
    setActivePanel('none');
  }, []);

  const closeGame = useCallback(() => {
    sceneEvents.emitBlackhole(false);
    setPlayingGame(null);
  }, []);

  // Fly the 3D camera to the celestial body for the active panel
  useEffect(() => {
    sceneEvents.emitCameraTarget({ panelId: activePanel });
  }, [activePanel]);

  const activeSide: 'left' | 'right' = LEFT_PANELS.includes(activePanel) ? 'left' : 'right';

  if (!verified) {
    return <AgeGate onVerify={verify} onReject={reject} rejected={!showGate} />;
  }

  if (!introComplete) {
    return <WarpIntro onComplete={() => { setIntroComplete(true); soundEngine.startAmbient(); }} />;
  }

  return (
    <MotionConfig reducedMotion="user">
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: 'var(--color-void-900)' }} aria-label="Gladiator Studio">
      <a href="#main" className="skip-to-content">Skip to content</a>

      {/* 3D scene — always behind everything */}
      <StarfieldCanvas />

      {/* Holographic display overlay — subtle scanlines over the 3D backdrop */}
      <div className="fx-holo" aria-hidden="true" />

      <main id="main">
        {/* Hero — full-screen holotable; hidden entirely while a panel is open */}
        <AnimatePresence mode="popLayout">
          {activePanel === 'none' && (
            <motion.div
              key="hero-full"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
              transition={{ duration: 0.4 }}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
            >
              <Hero panelSide={activeSide} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Top status bar — hidden on mobile when a panel is open */}
      {!(isMobile && activePanel !== 'none') && (
        <StatusBar isConnected={isConnected} totalEvents={totalEvents} totalAmount={totalAmount} isMobile={isMobile} />
      )}

      {/* Sliding content panel */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40 }}>
        <AnimatePresence mode="wait">
          {activePanel !== 'none' && (
            <ContentPanel key={activePanel} panelId={activePanel} side={activeSide} onClose={handleClose} isMobile={isMobile}>
              <ErrorBoundary>
                <Suspense fallback={<PanelSpinner />}>
                  {activePanel === 'games' && (
                    <GameShowcase slotGames={gameData?.slotGames ?? []} miniGames={gameData?.miniGames ?? []} loading={gameData === null} />
                  )}
                  {activePanel === 'about' && <AboutSection />}
                  {activePanel === 'team' && <TeamSection />}
                  {activePanel === 'journey' && <JourneySection />}
                  {activePanel === 'live' && <LiveActivityFeed />}
                  {activePanel === 'careers' && <CareersSection />}
                  {activePanel === 'contact' && <ContactSection />}
                </Suspense>
              </ErrorBoundary>
            </ContentPanel>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      {isMobile ? (
        <>
          <MobileMenuButton onClick={() => { soundEngine.click(); setDrawerOpen(true); }} />
          <MobileDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} activePanel={activePanel} onActivate={handleActivate} />
        </>
      ) : (
        <CommandBar activePanel={activePanel} onActivate={handleActivate} />
      )}

      {/* Game overlay */}
      <AnimatePresence>
        {playingGame && (
          <GameOverlay key="game-overlay" game={playingGame} isMobile={isMobile} onClose={closeGame} />
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
