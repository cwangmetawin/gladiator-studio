import { useCallback, useMemo, useRef, useState } from 'react';
import { createClientAreaSounds } from '@/shared/audio/transitionSound';
import { soundEngine } from '@/shared/utils/soundEngine';

/** Capture the actual pointer/keyboard trigger before a lazy modal isolates the page. */
export function useClientArea() {
  const [clientArea, setClientArea] = useState<'closed' | 'open'>('closed');
  const clientSounds = useMemo(() => createClientAreaSounds(soundEngine), []);
  const clientOpenerRef = useRef<HTMLElement | null>(null);
  const openClientArea = useCallback((opener: HTMLButtonElement) => {
    if (!clientSounds.open()) return;
    clientOpenerRef.current = opener;
    opener.focus({ preventScroll: true });
    setClientArea('open');
  }, [clientSounds]);
  const closeClientArea = useCallback(() => {
    if (clientSounds.close()) setClientArea('closed');
  }, [clientSounds]);
  return { clientArea, clientOpenerRef, openClientArea, closeClientArea };
}
