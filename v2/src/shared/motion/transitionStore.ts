import { initialTransition, nextTransitionDeadline, transitionReducer, type PanelId, type TransitionEvent } from './transition';
import type { MotionMode } from './tokens';

interface TransitionClock {
  readonly now: () => number;
  readonly schedule: (callback: () => void, delayMs: number) => unknown;
  readonly cancel: (timer: unknown) => void;
}

export function createTransitionStore(clock: TransitionClock = {
  now: () => performance.now(),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
}) {
  let snapshot = initialTransition();
  let timer: unknown;
  let generation = 0;
  const listeners = new Set<() => void>();

  function dispatch(event: TransitionEvent): void {
    const next = transitionReducer(snapshot, event);
    if (next === snapshot) return;
    snapshot = next;
    clock.cancel(timer);
    const currentGeneration = ++generation;
    const deadline = nextTransitionDeadline(snapshot);
    if (deadline !== null) {
      timer = clock.schedule(() => {
        if (currentGeneration !== generation) return;
        // Browsers may round a timer down. Advance at least to its scheduled boundary.
        dispatch({ type: 'tick', now: Math.max(deadline, clock.now()) });
      }, Math.max(0, deadline - clock.now()));
    }
    listeners.forEach(listener => listener());
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    request: (target: PanelId): void => dispatch({ type: 'request', target, now: clock.now() }),
    focusGame: (game: string): void => dispatch({ type: 'focus-game', game, now: clock.now() }),
    configure: (mode: MotionMode): void => dispatch({ type: 'configure', mode, now: clock.now() }),
  };
}

export const transitionStore = createTransitionStore();
