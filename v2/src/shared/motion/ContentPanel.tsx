import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useDialogFocus } from '@/shared/hooks/useDialogFocus';
import { useJourneyScroll } from '@/features/journey/useJourneyScroll';
import { Reveal } from '@/shared/ui/Reveal';
import { soundEngine } from '@/shared/utils/soundEngine';
import { motionTokens, transitionTimeline } from './tokens';
import { PanelMotionContext } from './panelMotion';
import type { PanelId, TransitionState } from './transition';

interface ContentPanelProps {
  readonly panelId: PanelId;
  readonly side: 'left' | 'right';
  readonly label: string;
  readonly index: number;
  readonly count: number;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly isMobile: boolean;
  readonly onMenu: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly transition: TransitionState;
}

function PanelContents({ children, duration, instant }: {
  readonly children: ReactNode; readonly duration: number; readonly instant: boolean;
}) {
  const present = useIsPresent();
  return (
    <motion.div
      initial={instant ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: duration / 1000, ease: motionTokens.ease }}
      aria-hidden={present ? undefined : true} inert={!present}
      style={{ gridArea: '1 / 1', minWidth: 0, pointerEvents: present ? 'auto' : 'none' }}
    >
      {children}
    </motion.div>
  );
}

/** One persistent frame lets interruptions reverse its current Framer values. */
export function ContentPanel({ panelId, side, label, index, count, onClose, children, isMobile, onMenu, returnFocusRef, transition }: ContentPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dialogRef = useDialogFocus<HTMLElement>({ modal: isMobile, onEscape: onClose, initialFocusRef: closeRef, returnFocusRef });
  const journey = useJourneyScroll(panelId === 'journey', scrollRef);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    closeRef.current?.focus({ preventScroll: true });
  }, [panelId]);

  const panelMotion = useMemo(() => {
    const timeline = transitionTimeline(transition.mode, transition.kind);
    const contentEnd = transition.panelStartedAt + timeline.bodyDelayMs + timeline.revealMs;
    return {
      timeline, enteredAt: transition.panelStartedAt,
      settled: transition.phase === 'open' || performance.now() >= contentEnd,
      instantContent: transition.mode !== 'desktop',
    };
  }, [transition]);
  const timeline = panelMotion.timeline;
  const reduced = transition.mode === 'reduced';
  const closing = transition.phase === 'closing';
  const isLeft = side === 'left';
  const panelWidth = isMobile ? viewportWidth : Math.min(660, Math.max(340, viewportWidth * 0.44));
  const x = isMobile || isLeft ? 0 : viewportWidth - panelWidth;
  const shift = reduced ? 0 : (isMobile ? 12 : 24) * (isLeft ? -1 : 1);
  const settled = transition.phase === 'open';

  return (
    <PanelMotionContext.Provider value={panelMotion}>
      <motion.aside
        ref={dialogRef} role="dialog" aria-modal={isMobile || undefined} tabIndex={-1}
        initial={settled ? false : { x: x + shift, opacity: 0 }}
        animate={{ x: closing ? x + shift : x, opacity: closing ? 0 : 1 }}
        transition={{ duration: (closing ? timeline.exitMs : timeline.frameMs) / 1000, ease: motionTokens.ease,
          x: { duration: reduced ? 0 : timeline.frameMs / 1000, ease: motionTokens.ease } }}
        aria-label={`${label} panel`} data-panel-id={panelId}
        data-journey-chapter={panelId === 'journey' ? journey.chapter + 1 : undefined}
        className="glass narrative-panel"
        style={{
          position: 'fixed', left: 0, top: isMobile ? 0 : 56, bottom: isMobile ? 0 : 56,
          width: isMobile ? '100%' : 'clamp(340px, 44vw, 660px)', maxWidth: '100%', borderRadius: 0,
          borderTop: 'none', borderBottom: 'none',
          borderLeft: isLeft ? 'none' : '1px solid var(--color-line)',
          borderRight: isLeft ? '1px solid var(--color-line)' : 'none',
          zIndex: 40, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          pointerEvents: closing ? 'none' : 'auto', paddingTop: isMobile ? 'env(safe-area-inset-top, 0px)' : 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-line)', flexShrink: 0 }}>
          <Reveal stage="eyebrow" y={0}>
            <span className="eyebrow">
              <span className="eyebrow__dot animate-electric-pulse" aria-hidden="true" />
              {label}
              <span style={{ color: 'var(--color-text-dim)', marginLeft: 8 }}>{String(index).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
            </span>
          </Reveal>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isMobile && (
              <button type="button" onClick={() => { soundEngine.click(); onMenu(); }} className="icon-btn" aria-label="Open menu">
                <Menu size={15} aria-hidden="true" />
              </button>
            )}
            <button ref={closeRef} type="button" onClick={onClose} className="icon-btn" aria-label={`Close ${label} panel`}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          ref={scrollRef} className="panel-content"
          style={{
            flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain',
            padding: 'clamp(20px, 3vw, 36px)',
            paddingBottom: isMobile ? 'calc(28px + env(safe-area-inset-bottom, 0px))' : undefined,
          }}
        >
          <div style={{ display: 'grid', minWidth: 0 }}>
            <AnimatePresence initial={false}>
              <PanelContents key={panelId} duration={timeline.frameMs} instant={settled || transition.mode !== 'desktop'}>
                {panelId === 'live' ? <Reveal>{children}</Reveal> : children}
              </PanelContents>
            </AnimatePresence>
          </div>
        </div>
      </motion.aside>
    </PanelMotionContext.Provider>
  );
}
