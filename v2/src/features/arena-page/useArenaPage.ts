import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createClientAreaSounds } from '@/shared/audio/transitionSound';
import { soundEngine } from '@/shared/utils/soundEngine';
import type { PanelId } from '@/shared/motion/transition';
import { pageTransition } from './pageTransitionStore';

export type ArenaPageId = Exclude<PanelId, 'none'>;
const getFlightPhase = () => pageTransition.getSnapshot().phase;

/** Section changes never close the modal or replace the original homepage trigger. */
export function useArenaPage() {
  const [page, setPage] = useState<ArenaPageId | null>(null);
  const [focusGame, setFocusGame] = useState<{ readonly title: string; readonly request: number } | null>(null);
  const current = useRef<ArenaPageId | null>(null), openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false), closing = useRef(false);
  const phase = useSyncExternalStore(pageTransition.subscribe, getFlightPhase, getFlightPhase);
  const focusRevision = useRef(0);
  const cues = useMemo(() => createClientAreaSounds(soundEngine), []);
  useLayoutEffect(() => {
    if (!closing.current || phase !== 'idle') return;
    closing.current = false;
    current.current = null;
    setPage(null);
    setFocusGame(null);
  }, [phase]);
  useLayoutEffect(() => {
    // The bar and constellation doors have regained visibility/inert by this commit.
    if (wasOpen.current && page === null) openerRef.current?.focus({ preventScroll: true });
    wasOpen.current = page !== null;
  }, [page]);
  const openPage = useCallback((next: ArenaPageId, opener?: HTMLElement | null, title?: string) => {
    if (current.current === null) {
      openerRef.current = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      openerRef.current?.focus({ preventScroll: true });
      cues.open();
    } else if (closing.current) cues.open();
    else if (current.current !== next) soundEngine.click();
    closing.current = false;
    current.current = next;
    pageTransition.request(next);
    setPage(next);
    setFocusGame(title ? { title, request: ++focusRevision.current } : null);
  }, [cues]);
  const closePage = useCallback(() => {
    if (!cues.close()) return;
    closing.current = true;
    pageTransition.request(null);
    if (pageTransition.getSnapshot().phase === 'idle') {
      closing.current = false;
      current.current = null;
      setPage(null);
      setFocusGame(null);
    }
  }, [cues]);
  return { page, openerRef, focusGame, openPage, closePage };
}
