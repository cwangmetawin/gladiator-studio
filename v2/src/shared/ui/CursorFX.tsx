'use client';

import { memo, useEffect, useRef } from 'react';
import './cursor-fx.css';

// Custom contextual cursor (desktop, fine-pointer, motion-on only). A lerp-followed
// ring that expands and shows a label when over any element carrying [data-cursor]
// — e.g. PLAY over a game card, OPEN over a hub node. The native cursor is hidden
// only while this is active so there's always a clear pointer fallback otherwise.
// Memoised: CursorFX takes no props, so memo stops it re-rendering when the app
// re-renders (e.g. live-feed ticks) — otherwise React would reset the div's
// className on every render and strip the imperatively-toggled state classes.
function CursorFXImpl() {
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pointerQuery = window.matchMedia('(pointer: fine)');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const ring = ringRef.current;
    const label = labelRef.current;
    if (!ring || !label) return;

    let raf = 0;
    let active = false;
    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let cx = mx, cy = my;
    let curLabel = '';
    let visible = false;

    const syncLabel = (target: Element | null) => {
      const el = target?.closest?.('[data-cursor]') as HTMLElement | null | undefined;
      const lbl = el?.dataset.cursor ?? '';
      if (lbl !== curLabel) {
        curLabel = lbl;
        label.textContent = lbl;
        ring.classList.toggle('is-active', lbl.length > 0);
      }
    };
    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      if (!visible) { visible = true; ring.classList.add('is-visible'); }
      syncLabel(e.target as Element | null);
    };
    const onLeave = () => { visible = false; ring.classList.remove('is-visible'); };
    const onDown = () => ring.classList.add('is-down');
    const onUp = () => ring.classList.remove('is-down');

    let frame = 0;
    const loop = () => {
      cx += (mx - cx) * 0.2;
      cy += (my - cy) * 0.2;
      ring.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
      // The page can change under a still cursor (a panel slides in over a hub node):
      // re-hit-test now and then so a stale "OPEN"/"PLAY" label never lingers.
      if (visible && ++frame % 10 === 0) syncLabel(document.elementFromPoint(mx, my));
      raf = requestAnimationFrame(loop);
    };

    const stop = () => {
      active = false;
      cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('has-cursor-fx');
      ring.classList.remove('is-visible', 'is-active', 'is-down');
      label.textContent = '';
      curLabel = '';
      visible = false;
    };

    const syncMedia = () => {
      if (!pointerQuery.matches || motionQuery.matches) { stop(); return; }
      if (active) return;
      active = true;
      document.body.classList.add('has-cursor-fx');
      window.addEventListener('mousemove', onMove, { passive: true });
      document.addEventListener('mouseleave', onLeave);
      window.addEventListener('mousedown', onDown);
      window.addEventListener('mouseup', onUp);
      raf = requestAnimationFrame(loop);
    };

    pointerQuery.addEventListener('change', syncMedia);
    motionQuery.addEventListener('change', syncMedia);
    syncMedia();

    return () => {
      pointerQuery.removeEventListener('change', syncMedia);
      motionQuery.removeEventListener('change', syncMedia);
      stop();
    };
  }, []);

  return (
    <div ref={ringRef} className="cursor-fx" aria-hidden="true">
      <span ref={labelRef} className="cursor-fx__label" />
    </div>
  );
}

export const CursorFX = memo(CursorFXImpl);
