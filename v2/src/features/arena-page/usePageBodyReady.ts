import { useEffect, useState, useSyncExternalStore } from 'react';
import { pageTransition, type PageDestination } from './pageTransitionStore';
import { PAGE_BODY_IDLE_WAIT_MS, schedulePageIdleWork } from './pageBodyWork';

type BodyState = Pick<ReturnType<typeof pageTransition.getSnapshot>, 'sceneAvailable' | 'phase' | 'revision' | 'targetPage'>;
let bodyState: BodyState | undefined;
const getBodyState = (): BodyState => {
  const { sceneAvailable, phase, revision, targetPage } = pageTransition.getSnapshot();
  if (!bodyState || bodyState.sceneAvailable !== sceneAvailable || bodyState.phase !== phase
    || bodyState.revision !== revision || bodyState.targetPage !== targetPage) {
    bodyState = { sceneAvailable, phase, revision, targetPage };
  }
  return bodyState;
};

/** Titles are eager; body mounts and image requests wait for an idle turn after the landing frame. */
export function usePageBodyReady(page: PageDestination): boolean {
  // Parallax scroll writes must not rerender the catalogue or its portraits.
  const state = useSyncExternalStore(pageTransition.subscribe, getBodyState, getBodyState);
  const [readyRevision, setReadyRevision] = useState(-1);
  const { sceneAvailable, phase, revision, targetPage } = state;
  useEffect(() => {
    if (!sceneAvailable || phase !== 'settled' || targetPage !== page) return;
    return schedulePageIdleWork(() => setReadyRevision(revision), PAGE_BODY_IDLE_WAIT_MS);
  }, [sceneAvailable, phase, revision, targetPage, page]);
  return !sceneAvailable || (phase === 'settled' && targetPage === page && readyRevision === revision);
}
