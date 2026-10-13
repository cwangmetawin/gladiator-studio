import { useLayoutEffect, useRef } from 'react';
import { gameKey } from './gameIdentity';
import { skyStore } from './skyStore';
import { DESKTOP_DOOR_CAP, selectDoors, type DoorCandidate, type ScreenRect } from './doorSelection';
import { STARS_PER_CONSTELLATION } from './constellationStore';
import './constellations.css';

interface ConstellationDoorsProps {
  readonly active: boolean;
  readonly phone: boolean;
  readonly games: readonly { readonly title: string }[];
  readonly onFocusGame: (title: string) => void;
}

const SLOTS = Array.from({ length: DESKTOP_DOOR_CAP }, (_, i) => i);
const COUNTS = Array.from({ length: STARS_PER_CONSTELLATION + 1 }, (_, i) => `${i} recent ${i === 1 ? 'win' : 'wins'}`);
const OBSTACLES = '.holo-node, .mobile-node, .hero-logo-wrap, [aria-label="Primary actions"], .hub-layer, [data-sky-obstacle], .shell-bar, .ticker, [aria-label="Open menu"]';

/** The scene publishes after projection; these six persistent buttons never need a RAF. */
export function ConstellationDoors({ active, phone, games, onFocusGame }: ConstellationDoorsProps) {
  const rootRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    const titles = buttons.map(button => button.querySelector<HTMLElement>('.constellation__name')!);
    const counts = buttons.map(button => button.querySelector<HTMLElement>('.constellation__count')!);
    const catalogue = new Map(games.map(game => [gameKey(game.title), game.title]));
    const selected: DoorCandidate[] = [];
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
      for (let i = 0; i < buttons.length; i++) {
        const button = buttons[i]!;
        const candidate = selected[i];
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
        button.style.left = pixels[candidate.rect.left]!;
        button.style.top = pixels[candidate.rect.top]!;
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

  return (
    <nav ref={rootRef} className="constellation-doors" aria-label="Recent win constellations" inert={!active} hidden={!active}>
      {SLOTS.map(slot => (
        <button key={slot} type="button" className="constellation" hidden data-game="" data-cursor="VIEW"
          onClick={event => onFocusGame(event.currentTarget.dataset.game ?? '')}>
          <span className="constellation__name" />
          <span className="constellation__count" />
        </button>
      ))}
    </nav>
  );
}
