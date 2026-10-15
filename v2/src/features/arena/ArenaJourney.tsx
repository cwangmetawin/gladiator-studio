import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useMotionPreference } from '@/shared/motion/useMotionPreference';
import { ArenaHero, type ArenaHeroProps } from './ArenaHero';
import { ArenaLanding } from './ArenaLanding';
import { doorsVisible, journeyProgress } from './journeyProgress';
import { bindJourneyScroll, lockJourneyScroll } from './journeyScroll';
import type { HallPlay } from './hallActions';
import { arenaSoundVisibility } from './arenaSound';
import { soundEngine } from '@/shared/utils/soundEngine';
import './arenaJourney.css';

interface ArenaJourneyProps extends ArenaHeroProps {
  readonly scrollLocked: boolean;
  readonly onPlayGame: (game: HallPlay) => void;
}

export function ArenaJourney({ scrollLocked, onPlayGame, ...heroProps }: ArenaJourneyProps) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useMotionPreference();
  // React only needs two visibility boundaries; continuous progress goes to CSS and the camera directly.
  const firstVisible = useSyncExternalStore(journeyProgress.subscribe,
    () => doorsVisible(journeyProgress.getSnapshot(), reduced), () => true);
  const arenaVisible = useSyncExternalStore(journeyProgress.subscribe,
    () => journeyProgress.getSnapshot() >= (reduced ? 1 : 1.05), () => false);
  useLayoutEffect(() => root.current ? bindJourneyScroll(root.current) : undefined, []);
  useLayoutEffect(() => scrollLocked ? lockJourneyScroll() : undefined, [scrollLocked]);
  useLayoutEffect(() => {
    arenaSoundVisibility.set(!scrollLocked);
    if (scrollLocked) soundEngine.stopArc();
    return () => { arenaSoundVisibility.set(false); soundEngine.stopArc(); };
  }, [scrollLocked]);
  return (
    <div ref={root} className="arena-journey" data-arena-journey="">
      <div className="arena-journey__first" aria-hidden={!firstVisible} inert={!firstVisible}>
        <ArenaHero {...heroProps} />
        <p className="arena-journey__scroll" aria-hidden="true">Scroll to enter the arena <span>01 / 02</span></p>
      </div>
      <ArenaLanding visible={arenaVisible} interactive={!scrollLocked} onPlayGame={onPlayGame} />
    </div>
  );
}
