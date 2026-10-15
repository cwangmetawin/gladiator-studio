import type { ArenaPageId } from './useArenaPage';

export type PageDestination = ArenaPageId | 'partner';
export type PageFlightPhase = 'idle' | 'flying' | 'settled' | 'closing';
interface PageTransitionSnapshot {
  readonly targetPage: PageDestination | null;
  readonly revision: number;
  readonly sceneAvailable: boolean;
  readonly phase: PageFlightPhase;
  readonly scrollProgress: number;
}

/** Only plain state crosses from the modal to the one scene; camera objects stay in the scene. */
export function createPageTransitionStore() {
  let state: PageTransitionSnapshot = { targetPage: null, revision: 0, sceneAvailable: false, phase: 'idle', scrollProgress: 0 };
  const listeners = new Set<() => void>();
  const publish = (next: PageTransitionSnapshot) => { state = next; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    request(targetPage: PageDestination | null) {
      if (targetPage === state.targetPage) return;
      publish({ ...state, targetPage, revision: state.revision + 1, scrollProgress: 0,
        phase: state.sceneAvailable ? targetPage ? 'flying' : 'closing' : targetPage ? 'settled' : 'idle' });
    },
    setAvailable(sceneAvailable: boolean) {
      if (sceneAvailable === state.sceneAvailable) return;
      publish({ ...state, sceneAvailable,
        phase: sceneAvailable && state.targetPage ? 'flying' : state.targetPage ? 'settled' : 'idle' });
    },
    setPhase(phase: PageFlightPhase, revision = state.revision) {
      if (revision !== state.revision || phase === state.phase) return;
      if ((state.targetPage === null) !== (phase === 'idle' || phase === 'closing')) return;
      publish({ ...state, phase });
    },
    setScroll(progress: number) {
      const scrollProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
      if (scrollProgress !== state.scrollProgress) publish({ ...state, scrollProgress });
    },
  };
}

export const pageTransition = createPageTransitionStore();
