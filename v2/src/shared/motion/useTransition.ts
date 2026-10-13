import { useLayoutEffect, useSyncExternalStore } from 'react';
import { useMotionPreference } from './useMotionPreference';
import { transitionStore } from './transitionStore';

export function useTransition(isMobile: boolean) {
  const reducedMotion = useMotionPreference();
  useLayoutEffect(() => {
    transitionStore.configure(reducedMotion ? 'reduced' : isMobile ? 'phone' : 'desktop');
  }, [isMobile, reducedMotion]);
  return useSyncExternalStore(transitionStore.subscribe, transitionStore.getSnapshot, transitionStore.getSnapshot);
}
