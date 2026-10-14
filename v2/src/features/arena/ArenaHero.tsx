import { useLayoutEffect, useRef } from 'react';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
import type { PanelId as TransitionTarget } from '@/shared/motion/transition';
import { BigWinFlash } from './BigWinFlash';
import { FlatEmblem } from './FlatEmblem';
import { emblemSlot } from './emblemSlot';
import { useCountUp } from './useCountUp';
import './arenaHero.css';

// The first screen after the gate (Phase 4 M1): the 3D emblem has the stage, one huge line says what this is,
// and one rule of small print carries the studio's three numbers. The emblem itself is drawn in the sky's
// WebGL canvas behind this DOM; the slot below only tells the scene where to put it. Where there is no WebGL
// (or before the 3D emblem has drawn) the flat SVG emblem fills the same slot. The section mounts when the age
// gate releases the first screen, and its pieces arrive by CSS keyframes from that moment.

const TITLE = ['Built for', 'the arena'] as const;

export interface ArenaHeroProps {
  readonly panelSide?: 'left' | 'right';
  readonly active?: boolean;
  readonly target?: TransitionTarget;
}

function Letters({ line, offset }: { readonly line: string; readonly offset: number }) {
  let index = offset;
  return (
    <span className="arena-hero__line" aria-hidden="true">
      {Array.from(line).map((char, at) => (char === ' '
        ? <span key={at} className="arena-hero__space"> </span>
        : <span key={at} className="arena-hero__ch" style={{ ['--i' as string]: index++ }}>{char}</span>))}
    </span>
  );
}

function CountStat({ end, decimals, suffix, label, delay }: {
  readonly end: number; readonly decimals: number; readonly suffix: string; readonly label: string; readonly delay: number;
}) {
  const value = useCountUp(end, delay);
  return (
    <li className="arena-hero__stat">
      <b>{value.toFixed(decimals)}{suffix}</b>
      <span>{label}</span>
    </li>
  );
}

/** Publishes where the emblem belongs: the slot, the stage it shares with the headline, and the viewport. */
function useSlotPublisher(slotRef: React.RefObject<HTMLElement | null>, stageRef: React.RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const slot = slotRef.current, stage = stageRef.current;
    if (!slot || !stage) return;
    const measure = (): void => {
      const s = slot.getBoundingClientRect(), g = stage.getBoundingClientRect();
      const fraction = Number.parseFloat(getComputedStyle(slot).getPropertyValue('--emblem-fraction')) || 0.86;
      emblemSlot.publish({
        slot: { x: s.x, y: s.y, width: s.width, height: s.height }, fraction,
        stage: { x: g.x, y: s.y, width: g.width, height: s.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    observer.observe(stage);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); emblemSlot.publish(null); };
  }, [slotRef, stageRef]);
}

export function ArenaHero({ target = 'none' }: ArenaHeroProps) {
  const hero = useSection('hero', { tagline: 'A MetaWin Studio' });
  const stats = useStudioStats();
  const stageRef = useRef<HTMLElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  useSlotPublisher(slotRef, stageRef);

  const numbers = [
    { end: stats.games, decimals: 0, suffix: '', label: 'games' },
    { end: stats.rtp, decimals: 1, suffix: '%', label: 'max RTP' },
    { end: stats.markets, decimals: 0, suffix: '', label: 'markets' },
  ];

  return (
    <section id="home" ref={stageRef} className="arena-hero" aria-labelledby="arena-title" data-dimming={target !== 'none'}>
      <div ref={slotRef} className="arena-hero__slot" data-sky-obstacle="" role="img" aria-label="Gladiator Studio emblem: a helmet between two wings">
        <FlatEmblem className="arena-hero__flat" />
      </div>

      <h1 id="arena-title" className="arena-hero__title" data-sky-obstacle="" aria-label="Gladiator Studio. Built for the arena">
        <Letters line={TITLE[0]} offset={0} />
        <Letters line={TITLE[1]} offset={TITLE[0].length} />
      </h1>

      <div className="arena-hero__meta" data-sky-obstacle="">
        <p className="arena-hero__tagline">
          {String(hero.tagline)}
          <span aria-hidden="true"> — </span>
          <a href="https://metawin.com" target="_blank" rel="noopener noreferrer">metawin.com</a>
        </p>
        <ul className="arena-hero__stats" aria-label={numbers.map(n => `${n.end}${n.suffix} ${n.label}`).join(', ')}>
          {numbers.map((n, i) => <CountStat key={n.label} {...n} delay={700 + i * 160} />)}
        </ul>
      </div>

      <BigWinFlash />
    </section>
  );
}
