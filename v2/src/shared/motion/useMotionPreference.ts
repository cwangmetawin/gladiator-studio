import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** Read on each notification so changing the OS/browser preference works mid-flight. */
export const motionPreference = Object.freeze({
  getSnapshot: () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  getServerSnapshot: () => false,
  subscribe(listener: () => void): () => void {
    const query = window.matchMedia(QUERY);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  },
});

export function useMotionPreference(): boolean {
  return useSyncExternalStore(motionPreference.subscribe, motionPreference.getSnapshot, motionPreference.getServerSnapshot);
}
