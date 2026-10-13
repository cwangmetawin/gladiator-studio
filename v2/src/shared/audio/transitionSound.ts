import { transitionTimeline } from '@/shared/motion/tokens';
import type { TransitionState } from '@/shared/motion/transition';

interface TransitionSource {
  readonly getSnapshot: () => TransitionState;
  readonly subscribe: (listener: () => void) => () => void;
}
interface TransitionSounds {
  readonly panelOpen: () => void;
  readonly panelClose: () => void;
  readonly sectionSwitch: () => void;
}

/** Reuse M2's arrival publication; no competing audio timer or click-side cue. */
export function bindTransitionSounds(store: TransitionSource, sounds: TransitionSounds): () => void {
  let target = store.getSnapshot().target;
  let pending: 'open' | 'switch' | null = null;
  return store.subscribe(() => {
    const state = store.getSnapshot();
    if (state.target !== target) {
      target = state.target;
      pending = target === 'none' ? null : state.kind === 'switch' ? 'switch' : 'open';
      if (target === 'none') sounds.panelClose();
    }
    const arrival = state.startedAt + transitionTimeline(state.mode, state.kind).panelAtMs;
    if (pending && state.panel === target && state.panelStartedAt === arrival) {
      const cue = pending;
      pending = null;
      if (cue === 'switch') sounds.sectionSwitch();
      else sounds.panelOpen();
    }
  });
}

/** Client Area callbacks describe real warp boundaries, including instant motion. */
export function createWarpSounds(sounds: { readonly warpStart: () => void; readonly warpArrival: () => void }) {
  let phase: 'closed' | 'flying' | 'arrived' = 'closed';
  return {
    start(): boolean {
      if (phase !== 'closed') return false;
      phase = 'flying';
      sounds.warpStart();
      return true;
    },
    arrive(): boolean {
      if (phase !== 'flying') return false;
      phase = 'arrived';
      sounds.warpArrival();
      return true;
    },
    cancel(): void { phase = 'closed'; },
  };
}

/** Pointer preview changes the sky; only a committed, settled centre card ticks. */
export function createCatalogueLock(tick: () => void) {
  let locked: string | null = null;
  return {
    prime(title: string): void { if (locked === null) locked = title; },
    lock(title: string): void {
      if (title === locked) return;
      const hadFocus = locked !== null;
      locked = title;
      if (hadFocus) tick();
    },
  };
}
