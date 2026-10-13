import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { journeyMotion } from './journeyMotion';

/** Observe the panel's local scroll area, including late content and resize changes. */
export function useJourneyScroll(active: boolean, scrollRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const container = scrollRef.current;
    if (!active || !container) return;
    container.scrollTop = 0;
    const update = () => {
      const range = container.scrollHeight - container.clientHeight;
      journeyMotion.setProgress(range > 0 ? container.scrollTop / range : 0);
    };
    const resize = new ResizeObserver(update);
    const observeContent = () => {
      resize.disconnect();
      resize.observe(container);
      for (const child of container.children) resize.observe(child);
      update();
    };
    const mutations = new MutationObserver(observeContent);
    mutations.observe(container, { childList: true });
    container.addEventListener('scroll', update, { passive: true });
    observeContent();
    return () => {
      container.removeEventListener('scroll', update);
      resize.disconnect();
      mutations.disconnect();
      journeyMotion.setProgress(0);
    };
  }, [active, scrollRef]);
  return useSyncExternalStore(journeyMotion.subscribe, journeyMotion.getChapterSnapshot, journeyMotion.getChapterSnapshot);
}
