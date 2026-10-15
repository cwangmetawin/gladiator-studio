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

/** One cue per committed open/close, independent of motion preference or repeated clicks. */
export function createClientAreaSounds(sounds: { readonly warpArrival: () => void; readonly panelClose: () => void }) {
  let open = false;
  return {
    open(): boolean {
      if (open) return false;
      open = true;
      sounds.warpArrival();
      return true;
    },
    close(): boolean {
      if (!open) return false;
      open = false;
      sounds.panelClose();
      return true;
    },
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
