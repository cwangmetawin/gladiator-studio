import { startTransition, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { sceneReadiness } from '@/features/starfield/sceneReadiness';

const STORAGE_KEY = 'gladiator_age_verified';

/**
 * After "I am 18 or older" the emblem ignites at once (GATE_IGNITE_MS), while the site and its 3D
 * emblem build underneath as a non-urgent update. The gate then fades (GATE_FADE_MS) into the first
 * screen, but only once that is ready (the 3D emblem has drawn, see useHomeReady): until then it holds
 * the lit frame, which the 3D emblem is lit to match.
 */
export const GATE_IGNITE_MS = 850;
export const GATE_FADE_MS = 450;
/** The longest the lit frame is held for a slow network or a scene that never comes, counted from the click. */
export const HOME_SAFETY_MS = 4500;

/**
 * ask / denied: the modal question and the refusal page.
 * igniting → lit → fading: the exit, an inert overlay above the site.
 * gone: verified without an exit animation (reduced motion): unmount in the same commit.
 */
export type GatePhase = 'ask' | 'denied' | 'igniting' | 'lit' | 'fading' | 'gone';

export interface GateState {
  /** App's verification has committed: the site is mounted beneath the gate. */
  readonly verified: boolean;
  readonly rejected: boolean;
  /** The visitor pressed "I am 18 or older" with motion allowed: the ignition is running. */
  readonly entering: boolean;
  /** The ignition has finished. */
  readonly ignited: boolean;
  /** The first screen can take over (useHomeReady). */
  readonly ready: boolean;
}

export function gatePhase({ verified, rejected, entering, ignited, ready }: GateState): GatePhase {
  if (entering) {
    if (!ignited) return 'igniting';
    return verified && ready ? 'fading' : 'lit';
  }
  if (verified) return 'gone';
  return rejected ? 'denied' : 'ask';
}

/** The phases in which the gate is a dialog; in the others it is an inert, hidden overlay. */
export function gateIsDialog(phase: GatePhase): boolean {
  return phase === 'ask' || phase === 'denied';
}

/** The three phases of the animated exit; the gate stays mounted, above the site, through all of them. */
export function gateIsExiting(phase: GatePhase): boolean {
  return phase === 'igniting' || phase === 'lit' || phase === 'fading';
}

/**
 * How long a phase lasts before the gate moves on: the end of the ignition, the end of the fade,
 * or (0) right now for a gate that has nothing left to show. Null: it waits for the visitor, or
 * (lit) for the first screen to be ready.
 */
export function gateStepDelay(phase: GatePhase): number | null {
  switch (phase) {
    case 'igniting': return GATE_IGNITE_MS;
    case 'fading': return GATE_FADE_MS;
    case 'gone': return 0;
    default: return null;
  }
}

export function useAgeGate(): { verified: boolean; verify: () => void; reject: () => void; showGate: boolean } {
  const [verified, setVerified] = useState(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [rejected, setRejected] = useState(false);

  const verify = useCallback(() => {
    try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
    // The whole site mounts on this update. As a transition it is rendered in slices, so the
    // gate's own (urgent) ignition keeps its frames while the site builds underneath it.
    startTransition(() => { setVerified(true); });
  }, []);

  const reject = useCallback(() => { setRejected(true); }, []);

  return { verified, verify, reject, showGate: !verified && !rejected };
}

/**
 * Whether the first screen can take over from the gate: the 3D emblem has drawn its first frame (or none is
 * coming, see SceneMilestone 'home'), or HOME_SAFETY_MS have passed since the visitor entered. The 3D
 * assets are warmed while the gate is up, so on a normal connection the ignition (850 ms) is the only wait.
 */
export function useHomeReady(entering: boolean): boolean {
  const sceneHome = useSyncExternalStore(sceneReadiness.subscribe, () => sceneReadiness.getSnapshot() === 'home', () => false);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!entering) return;
    const timer = window.setTimeout(() => setWaited(true), HOME_SAFETY_MS);
    return () => window.clearTimeout(timer);
  }, [entering]);
  return sceneHome || waited;
}

/**
 * The gate keeps its place after verification, as an overlay above the site, until its exit ends
 * (closeGate). A visitor verified earlier in the session never sees it.
 */
export function useGateOverlay(verified: boolean): { readonly gateOpen: boolean; readonly closeGate: () => void } {
  const [gateOpen, setGateOpen] = useState(() => !verified);
  const closeGate = useCallback(() => { setGateOpen(false); }, []);
  return { gateOpen, closeGate };
}
