import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createClientAreaSounds } from '@/shared/audio/transitionSound';
import { soundEngine } from '@/shared/utils/soundEngine';
import type { PanelId } from '@/shared/motion/transition';

export type ArenaPageId = Exclude<PanelId, 'none'>;

/** Section changes never close the modal or replace the original homepage trigger. */
export function useArenaPage() {
  const [page, setPage] = useState<ArenaPageId | null>(null);
  const [focusGame, setFocusGame] = useState<{ readonly title: string; readonly request: number } | null>(null);
  const current = useRef<ArenaPageId | null>(null), openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const focusRevision = useRef(0);
  const cues = useMemo(() => createClientAreaSounds(soundEngine), []);
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
    } else if (current.current !== next) soundEngine.click();
    current.current = next;
    setPage(next);
    setFocusGame(title ? { title, request: ++focusRevision.current } : null);
  }, [cues]);
  const closePage = useCallback(() => {
    if (!cues.close()) return;
    current.current = null;
    setPage(null);
    setFocusGame(null);
  }, [cues]);
  return { page, openerRef, focusGame, openPage, closePage };
}
