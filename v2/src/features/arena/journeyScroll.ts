import { journeyProgress, scrollScreens, smoothstep } from './journeyProgress';

/** Bind to native document scrolling. No wheel, touch or keyboard interception, and no second animation loop. */
export function bindJourneyScroll(root: HTMLElement): () => void {
  const track = root.closest<HTMLElement>('[data-arena-track]') ?? root;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const html = document.documentElement;
  const gutter = html.style.scrollbarGutter;
  html.style.scrollbarGutter = 'stable';
  let height = 1, start = 0;
  const written = new Map<string, string>();
  const write = (name: string, value: string): void => {
    if (written.get(name) === value) return;
    written.set(name, value); root.style.setProperty(name, value);
  };
  function paint(): void {
    const screens = scrollScreens(window.scrollY, height, start);
    const cut = screens >= 1;
    const hero = motion.matches ? Number(!cut) : 1 - smoothstep(0.025, 0.18, screens);
    const arena = motion.matches ? Number(cut) : smoothstep(0.95, 1.6, screens);
    write('--hero-opacity', hero.toFixed(3));
    write('--arena-opacity', arena.toFixed(3));
    write('--arena-rise', motion.matches ? '0px' : `${((1 - arena) * 40).toFixed(1)}px`);
    root.dataset.scrollScreens = screens.toFixed(4);
    journeyProgress.publish(screens);
  }
  function measure(): void {
    height = root.getBoundingClientRect().height || window.innerHeight;
    start = track.getBoundingClientRect().top + window.scrollY;
    paint();
  }
  const observer = new ResizeObserver(measure);
  observer.observe(root);
  window.addEventListener('scroll', paint, { passive: true });
  window.addEventListener('resize', measure);
  motion.addEventListener('change', paint);
  measure();
  return () => {
    observer.disconnect();
    window.removeEventListener('scroll', paint);
    window.removeEventListener('resize', measure);
    motion.removeEventListener('change', paint);
    html.style.scrollbarGutter = gutter;
  };
}

/**
 * The element whose overflow the viewport scrolls by. While <html> is overflow-visible the body's overflow
 * propagates to the viewport (the site's body sets overflow-x hidden), so the body is the one to lock: giving
 * <html> its own overflow moves the scroller and resets the position to 0.
 */
function viewportScroller(): HTMLElement {
  const root = document.documentElement, body = document.body;
  const rootOverflow = (typeof getComputedStyle === 'function' ? getComputedStyle(root).overflowY : root.style.overflowY) || 'visible';
  return rootOverflow === 'visible' && body ? body : root;
}

/** Fixed dialogs keep their own scrolling. Locking the viewport's scroller preserves the home position and the opener. */
export function lockJourneyScroll(): () => void {
  const target = viewportScroller(), style = target.style, previous = style.overflowY, y = window.scrollY;
  style.overflowY = 'hidden';
  if (window.scrollY !== y) window.scrollTo(0, y);
  return () => {
    style.overflowY = previous;
    if (window.scrollY !== y) window.scrollTo(0, y);
  };
}
