import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createClientAreaSounds } from '@/shared/audio/transitionSound';
import { soundEngine } from '@/shared/utils/soundEngine';
import { pageTransition } from '@/features/arena-page/pageTransitionStore';
const getFlightPhase = () => pageTransition.getSnapshot().phase;

/** Capture the actual pointer/keyboard trigger before a lazy modal isolates the page. */
export function useClientArea() {
  const [clientArea, setClientArea] = useState<'closed' | 'open'>('closed');
  const clientSounds = useMemo(() => createClientAreaSounds(soundEngine), []);
  const clientOpenerRef = useRef<HTMLElement | null>(null);
  const closing = useRef(false), active = useRef(false);
  const phase = useSyncExternalStore(pageTransition.subscribe, getFlightPhase, getFlightPhase);
  useLayoutEffect(() => {
    if (!closing.current || phase !== 'idle') return;
    closing.current = false;
    active.current = false;
    setClientArea('closed');
  }, [phase]);
  const openClientArea = useCallback((opener: HTMLButtonElement) => {
    if (!clientSounds.open()) return;
    if (!active.current) {
      clientOpenerRef.current = opener;
      opener.focus({ preventScroll: true });
    }
    active.current = true;
    closing.current = false;
    pageTransition.request('partner');
    setClientArea('open');
  }, [clientSounds]);
  const closeClientArea = useCallback(() => {
    if (!clientSounds.close()) return;
    closing.current = true;
    pageTransition.request(null);
    if (pageTransition.getSnapshot().phase === 'idle') {
      closing.current = false;
      active.current = false;
      setClientArea('closed');
    }
  }, [clientSounds]);
  return { clientArea, clientOpenerRef, openClientArea, closeClientArea };
}
