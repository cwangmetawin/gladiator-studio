import { pageTransition } from './pageTransitionStore';

export const PAGE_BODY_IDLE_WAIT_MS = 32;

/** Idle tasks are cancelled as soon as a camera flight takes ownership of the main thread. */
export function schedulePageIdleWork(work: () => void, maximumWaitMs?: number): () => void {
  let cancelled = false, pending: number | undefined;
  const idleApi = typeof window.requestIdleCallback === 'function';
  const busy = () => {
    const { phase } = pageTransition.getSnapshot();
    return phase === 'flying' || phase === 'closing';
  };
  const clear = () => {
    if (pending === undefined) return;
    if (idleApi) window.cancelIdleCallback(pending);
    else window.clearTimeout(pending);
    pending = undefined;
  };
  const schedule = () => {
    if (cancelled || pending !== undefined || busy()) return;
    const run = () => {
      pending = undefined;
      if (cancelled || busy()) return;
      cancelled = true;
      unsubscribe();
      work();
    };
    pending = idleApi ? window.requestIdleCallback(run, maximumWaitMs === undefined ? undefined : { timeout: maximumWaitMs })
      : window.setTimeout(run, PAGE_BODY_IDLE_WAIT_MS);
  };
  const unsubscribe = pageTransition.subscribe(() => { if (busy()) clear(); else schedule(); });
  schedule();
  return () => { cancelled = true; clear(); unsubscribe(); };
}
