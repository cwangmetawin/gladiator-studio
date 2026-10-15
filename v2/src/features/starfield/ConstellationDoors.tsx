import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useMotionPreference } from '@/shared/motion/useMotionPreference';
import { doorsVisible, journeyProgress } from '@/features/arena/journeyProgress';
import { gameKey } from './gameIdentity';
import { skyStore } from './skyStore';
import { DESKTOP_DOOR_CAP, selectDoors, type DoorCandidate, type ScreenRect } from './doorSelection';
import { STARS_PER_CONSTELLATION } from './constellationStore';
import './constellations.css';

interface ConstellationDoorsProps {
  readonly active: boolean;
  readonly phone: boolean;
  readonly games: readonly { readonly title: string }[];
  readonly onFocusGame: (title: string, opener?: HTMLButtonElement) => void;
}

const SLOTS = Array.from({ length: DESKTOP_DOOR_CAP }, (_, i) => i);
const COUNTS = Array.from({ length: STARS_PER_CONSTELLATION + 1 }, (_, i) => `${i} recent ${i === 1 ? 'win' : 'wins'}`);
const OBSTACLES = '[data-sky-obstacle], .topbar, .shell-bar, .ticker';

/** The scene publishes after projection; these six persistent buttons never need a RAF. */
export function ConstellationDoors({ active: homeActive, phone, games, onFocusGame }: ConstellationDoorsProps) {
  const reduced = useMotionPreference();
  const firstScreen = useSyncExternalStore(journeyProgress.subscribe,
    () => doorsVisible(journeyProgress.getSnapshot(), reduced), () => true);
  const active = homeActive && firstScreen;
  const rootRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    const titles = buttons.map(button => button.querySelector<HTMLElement>('.constellation__name')!);
    const counts = buttons.map(button => button.querySelector<HTMLElement>('.constellation__count')!);
    const catalogue = new Map(games.map(game => [gameKey(game.title), game.title]));
    const selected: DoorCandidate[] = [];
    /** Which door each button holds. A door keeps its button for as long as it stays selected (see paint). */
    const held: (DoorCandidate | null)[] = buttons.map(() => null);
    const obstacles: ScreenRect[] = [];
    let pixels: string[] = [];

    const measure = (): void => {
      pixels = Array.from({ length: Math.ceil(Math.max(window.innerWidth, window.innerHeight)) + 1 }, (_, i) => `${i}px`);
      obstacles.length = 0;
      const elements = document.querySelectorAll<HTMLElement>(OBSTACLES);
      elements.forEach(element => {
        const rect = element.getBoundingClientRect();
        observer.observe(element);
        if (rect.right <= rect.left || rect.bottom <= rect.top) return;
        // Include the hub's bounded parallax, bob and magnetic hover without layout reads per frame.
        const padding = phone ? 12 : 40;
        obstacles.push({ left: rect.left - padding, top: rect.top - padding,
          right: rect.right + padding, bottom: rect.bottom + padding });
      });
      skyStore.setLayout(window.innerWidth, window.innerHeight, phone, obstacles);
    };

    const paint = (): void => {
      const candidates = skyStore.projections;
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i]!;
        candidate.gameTitle = catalogue.get(candidate.constellation.key) ?? '';
      }
      if (active && skyStore.ready) selectDoors(candidates, obstacles, phone, selected);
      else selected.length = 0;
      // Buttons never trade games: when the brightness order changes, a door that is still selected stays on its own
      // button, and only a door that came or went moves a button on or off. (A trade resizes the name and the count in
      // place, which is a layout shift, however the button is positioned: the first screen measured 0.04-0.16.)
      for (let i = 0; i < held.length; i++) {
        const door = held[i];
        if (door && !selected.includes(door)) held[i] = null;
      }
      for (let i = 0; i < selected.length; i++) {
        const door = selected[i]!;
        if (!held.includes(door)) held[held.indexOf(null)] = door;
      }
      for (let i = 0; i < buttons.length; i++) {
        const button = buttons[i]!;
        const candidate = held[i];
        button.hidden = !candidate;
        if (!candidate) continue;
        const title = candidate.gameTitle;
        const count = COUNTS[candidate.constellation.count]!;
        if (button.dataset.game !== title || counts[i]!.textContent !== count) {
          button.dataset.game = title;
          button.setAttribute('aria-label', `${title}, ${count}. Open game catalogue`);
          titles[i]!.textContent = title;
          counts[i]!.textContent = count;
          button.style.setProperty('--constellation-accent', candidate.constellation.accent.hex);
        }
        // By transform, not left/top: the sky drifts, so a door moves a little on every frame, and a transform moves no
        // layout box, so none of that is a layout shift.
        button.style.setProperty('--door-x', pixels[candidate.rect.left]!);
        button.style.setProperty('--door-y', pixels[candidate.rect.top]!);
      }
    };
    const refresh = (): void => { measure(); paint(); };
    const observer = new ResizeObserver(refresh);
    // The ticker mounts after the first socket event; observe shell children, not its animated chips.
    const mutations = new MutationObserver(refresh);
    if (root.parentElement) mutations.observe(root.parentElement, { childList: true });
    const home = document.getElementById('home');
    if (home) observer.observe(home);
    refresh();
    const timer = window.setTimeout(refresh, 1500); // Re-measure the settled hub entrance.
    window.addEventListener('resize', refresh);
    const unsubscribe = skyStore.onFrame(paint);
    return () => {
      unsubscribe(); observer.disconnect(); mutations.disconnect(); window.clearTimeout(timer);
      window.removeEventListener('resize', refresh);
    };
  }, [active, phone, games]);

  // `hidden` alone takes the doors out of clicks and focus. No `inert` prop: modal dialogs
  // set and restore sibling inert, and a second writer here left every door dead (PR #14).
  return (
    <nav ref={rootRef} className="constellation-doors" aria-label="Recent win constellations" hidden={!active}>
      {SLOTS.map(slot => (
        <button key={slot} type="button" className="constellation" hidden data-game="" data-cursor="VIEW"
          onClick={event => onFocusGame(event.currentTarget.dataset.game ?? '', event.currentTarget)}>
          <span className="constellation__name" />
          <span className="constellation__count" />
        </button>
      ))}
    </nav>
  );
}
