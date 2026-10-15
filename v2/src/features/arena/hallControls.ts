import { JOURNEY_SCREENS, journeyProgress, scrollScreens } from './journeyProgress';
import { clampHall, hallOffset, hallScreens, hallTrackScreens, snapHall, SNAP_IDLE_MS, HALL_SLICE } from './hallProgress';

interface Drag {
  readonly pointer: number;
  readonly x: number;
  readonly y: number;
  readonly offset: number;
  horizontal: boolean;
}
const EDITABLE = 'input, textarea, select, [contenteditable="true"], [role="slider"]';

/** Native document scrolling owns the position. Only a confirmed horizontal drag prevents default;
 * pan-y leaves vertical swipes to the browser. The scene alone damps the visual response. */
export function bindHallControls(root: HTMLElement, count: number, active: () => boolean) {
  const track = root.closest<HTMLElement>('[data-arena-track]') ?? root;
  const previousHeight = track.style.height, previousLimit = journeyProgress.getLimit();
  const limit = hallTrackScreens(count) - 1;
  track.style.height = `${Number((100 * hallTrackScreens(count)).toFixed(4))}dvh`;
  journeyProgress.setLimit(limit);
  let timer: number | undefined, drag: Drag | null = null, disposed = false;
  const height = (): number => root.getBoundingClientRect().height || window.innerHeight || 1;
  const start = (): number => track.getBoundingClientRect().top + window.scrollY;
  const offset = (): number => hallOffset(journeyProgress.getSnapshot(), count);
  const cancelTimer = (): void => { window.clearTimeout(timer); timer = undefined; };

  function publishScroll(screens: number): void {
    if (disposed || !active() || count === 0) return;
    const top = start() + screens * height();
    // Explicit instant avoids a global CSS scroll-behavior delaying the first turn.
    window.scrollTo({ top, behavior: 'instant' });
    journeyProgress.publish(scrollScreens(window.scrollY, height(), start(), limit));
  }
  function select(index: number): void { publishScroll(hallScreens(Math.round(clampHall(index, count)), count)); }
  function scheduleSnap(): void {
    cancelTimer();
    if (disposed || !active() || drag?.horizontal || journeyProgress.getSnapshot() < JOURNEY_SCREENS
      || Math.abs(offset() - Math.round(offset())) < 0.001) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!active() || journeyProgress.getSnapshot() < JOURNEY_SCREENS) return;
      const snapped = snapHall(offset(), SNAP_IDLE_MS, !!drag?.horizontal, count);
      if (snapped !== null) select(snapped);
    }, SNAP_IDLE_MS);
  }
  const unsubscribe = journeyProgress.subscribe(scheduleSnap);

  function onKey(event: KeyboardEvent): void {
    if (!active() || count === 0 || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || (event.target as Element | null)?.closest?.(EDITABLE)) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    select(Math.round(offset()) + (event.key === 'ArrowRight' ? 1 : -1));
  }
  function onDown(event: PointerEvent): void {
    if (!active() || drag || event.isPrimary === false || event.button !== 0
      || (event.target as Element | null)?.closest?.('button, a, input, textarea, select')) return;
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, offset: offset(), horizontal: false };
    cancelTimer();
  }
  function onMove(event: PointerEvent): void {
    if (!drag || drag.pointer !== event.pointerId || !active()) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.horizontal) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      drag.horizontal = true;
      root.setPointerCapture(event.pointerId);
      root.dataset.dragging = 'true';
    }
    if (event.cancelable) event.preventDefault();
    const width = Math.max(100, Math.min(window.innerWidth * 0.8, height() * 0.43));
    const next = clampHall(drag.offset - dx / width, count);
    publishScroll(JOURNEY_SCREENS + next * HALL_SLICE);
  }
  function endDrag(event?: PointerEvent): void {
    if (event && drag && event.pointerId !== drag.pointer) return;
    const previous = drag;
    drag = null;
    delete root.dataset.dragging;
    if (previous && root.hasPointerCapture(previous.pointer)) root.releasePointerCapture(previous.pointer);
    scheduleSnap();
  }
  function measure(): void {
    journeyProgress.publish(scrollScreens(window.scrollY, height(), start(), limit));
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', measure);
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  root.addEventListener('lostpointercapture', endDrag);
  measure();

  return {
    select,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      endDrag(); cancelTimer(); unsubscribe();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', measure);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', endDrag);
      root.removeEventListener('pointercancel', endDrag);
      root.removeEventListener('lostpointercapture', endDrag);
      track.style.height = previousHeight;
      journeyProgress.setLimit(previousLimit);
    },
  };
}
