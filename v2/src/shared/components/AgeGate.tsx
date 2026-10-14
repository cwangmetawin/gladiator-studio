import './ageGate.css';
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useMotionPreference } from '../motion/useMotionPreference';
import { BRAND_SKY } from '../brand/brandSky';
import { GATE_FADE_MS, GATE_IGNITE_MS, gateIsDialog, gateIsExiting, gatePhase, gateStepDelay, useGateOverlay } from './ageGateState';
import { GateEmblem } from './GateEmblem';

// The age gate is the site's first frame (Phase 4 M0): the brand only, never a game, an image
// of one, an amount or a win. It stays a modal dialog until the visitor answers. After
// "I am 18 or older" it stays mounted as an inert overlay: the emblem ignites at once while the
// site and its warp intro mount underneath, then the gate fades into the warp (never before the
// site is there, so no frame between them is empty) and calls onExited. With reduced motion
// there is no exit: the gate goes in the commit that verifies.

interface AgeGateProps {
  readonly verified: boolean;
  readonly rejected: boolean;
  readonly onVerify: () => void;
  readonly onReject: () => void;
  readonly onExited: () => void;
}

const BEGAMBLEAWARE = 'https://www.begambleaware.org';
const TIMING = { '--gate-ignite': `${GATE_IGNITE_MS}ms`, '--gate-fade': `${GATE_FADE_MS}ms` } as CSSProperties;

export function AgeGate({ verified, rejected, onVerify, onReject, onExited }: AgeGateProps) {
  const reducedMotion = useMotionPreference();
  const [entering, setEntering] = useState(false);
  const [ignited, setIgnited] = useState(false);
  const phase = gatePhase({ verified, rejected, entering, ignited });
  const exiting = gateIsExiting(phase);
  const denied = phase === 'denied';
  const titleId = useId();
  const labelId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>({ active: gateIsDialog(phase) });
  const exitedRef = useRef(onExited);
  exitedRef.current = onExited;

  // The exit runs in CSS; this only moves the gate on when a phase ends. A layout effect, so a
  // gate with nothing left to show (gone) is closed before the browser paints it again.
  useLayoutEffect(() => {
    const delay = gateStepDelay(phase);
    if (delay === null) return;
    const step = phase === 'igniting' ? () => setIgnited(true) : () => exitedRef.current();
    if (delay === 0) { step(); return; }
    const timer = window.setTimeout(step, delay);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const enter = (): void => {
    if (!reducedMotion) setEntering(true);
    onVerify();
  };

  if (phase === 'gone') return null;
  return (
    <div
      ref={dialogRef}
      className="gate"
      data-age-gate=""
      data-gate-phase={phase}
      data-exit={exiting ? '' : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={denied ? titleId : labelId}
      aria-describedby={descriptionId}
      aria-hidden={exiting || undefined}
      inert={exiting}
      tabIndex={-1}
      style={TIMING}
    >
      <div className="gate__sky" style={BRAND_SKY} aria-hidden="true" />
      <div className="gate__scroll">
        <div className="gate__stage">
          <div className="gate__hero">
            <GateEmblem mode={exiting ? 'ignite' : denied ? 'off' : 'idle'} reducedMotion={reducedMotion} />
            <h1 id={titleId} className="gate__title">
              {denied
                ? <><span className="gate__line">Access</span> <span className="gate__line">denied</span></>
                : <><span className="gate__line">Built for</span> <span className="gate__line">the arena</span></>}
            </h1>
          </div>
          {denied ? (
            <div className="gate__bar">
              <div className="gate__copy">
                <p className="gate__label gate__label--denied">18+ only</p>
                <p id={descriptionId} className="gate__text">You must be 18 or older to access this website. Please close this tab.</p>
              </div>
              <p className="gate__rg">
                Need help? Visit <a href={BEGAMBLEAWARE} target="_blank" rel="noopener noreferrer">BeGambleAware.org</a>
              </p>
            </div>
          ) : (
            <div className="gate__bar">
              <div className="gate__copy">
                <h2 id={labelId} className="gate__label">Age verification<span aria-hidden="true"> · 18+</span></h2>
                <p id={descriptionId} className="gate__text">
                  This site features gambling-related content for users aged 18 and over. By entering, you confirm you
                  meet the minimum age in your jurisdiction.
                </p>
              </div>
              <div className="gate__actions">
                <button type="button" className="gate__btn gate__btn--enter" onClick={enter}>I am 18 or older</button>
                <button type="button" className="gate__btn" onClick={onReject}>Under 18</button>
              </div>
              <p className="gate__rg">
                Gambling can be addictive. Play responsibly.{' '}
                <a href={BEGAMBLEAWARE} target="_blank" rel="noopener noreferrer">BeGambleAware.org</a>
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="gate__flash" aria-hidden="true" />
    </div>
  );
}

interface AgeGateLayerProps {
  readonly verified: boolean;
  readonly rejected: boolean;
  readonly onVerify: () => void;
  readonly onReject: () => void;
}

/**
 * Where App puts the gate. It owns whether the gate is still open, so when the exit ends only
 * this small component re-renders, not the site the gate has just revealed.
 */
export function AgeGateLayer({ verified, rejected, onVerify, onReject }: AgeGateLayerProps) {
  const { gateOpen, closeGate } = useGateOverlay(verified);
  if (!gateOpen) return null;
  return <AgeGate verified={verified} rejected={rejected} onVerify={onVerify} onReject={onReject} onExited={closeGate} />;
}
