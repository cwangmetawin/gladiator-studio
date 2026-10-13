import { useEffect, useLayoutEffect, useRef } from 'react';
import { sceneEvents } from '@/shared/utils/sceneEvents';
import { lookupGame } from '@/features/live-feed/liveCatalogue';
import { skyStore } from './skyStore';
import { MAX_CONSTELLATIONS } from './constellationStore';

// Attribute values are pooled too: no strings or React snapshots built on each frame.
const TRAIL_VALUES = Array.from({ length: 101 }, (_, i) => (i / 100).toFixed(2));
const COUNT_VALUES = Array.from({ length: MAX_CONSTELLATIONS + 1 }, (_, i) => String(i));

export function useGameSky(active: boolean, phone: boolean, reduced: boolean) {
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { skyStore.configure(phone, reduced); }, [phone, reduced]);

  useEffect(() => {
    // Socket aliases (Aviator → Navigator, Blackjack → MetaWin Blackjack) share one real game.
    const unsubscribe = sceneEvents.onWin(win => skyStore.addWin(lookupGame(win.gameName)?.title ?? win.gameName, win.amount));
    // Expire old wins even when M1 has stopped the scene behind an opaque panel.
    const timer = window.setInterval(skyStore.maintain, 1000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, []);

  useLayoutEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;
    const write = (): void => {
      const trail = TRAIL_VALUES[Math.round(skyStore.trail.state.strength * 100)]!;
      const count = COUNT_VALUES[skyStore.constellations.count]!;
      if (root.dataset.trail !== trail) root.dataset.trail = trail;
      if (root.dataset.skyGame !== skyStore.gameName) root.dataset.skyGame = skyStore.gameName;
      if (root.dataset.constellations !== count) root.dataset.constellations = count;
    };
    write();
    const unsubscribe = skyStore.subscribe(write);
    const unsubscribeFrame = skyStore.onFrame(write);
    return () => { unsubscribe(); unsubscribeFrame(); };
  }, [active]);
  return rootRef;
}
