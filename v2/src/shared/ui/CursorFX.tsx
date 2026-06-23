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
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ring = ringRef.current;
    const label = labelRef.current;
    if (!ring || !label) return;

    document.body.classList.add('has-cursor-fx');
    let raf = 0;
    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let cx = mx, cy = my;
    let curLabel = '';
    let visible = false;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      if (!visible) { visible = true; ring.classList.add('is-visible'); }
      const el = (e.target as Element | null)?.closest?.('[data-cursor]') as HTMLElement | null;
      const lbl = el?.dataset.cursor ?? '';
      if (lbl !== curLabel) {
        curLabel = lbl;
        label.textContent = lbl;
        ring.classList.toggle('is-active', lbl.length > 0);
      }
    };
    const onLeave = () => { visible = false; ring.classList.remove('is-visible'); };
    const onDown = () => ring.classList.add('is-down');
    const onUp = () => ring.classList.remove('is-down');

    const loop = () => {
      cx += (mx - cx) * 0.2;
      cy += (my - cy) * 0.2;
      ring.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('has-cursor-fx');
    };
  }, []);

  return (
    <div ref={ringRef} className="cursor-fx" aria-hidden="true">
      <span ref={labelRef} className="cursor-fx__label" />
    </div>
  );
}

export const CursorFX = memo(CursorFXImpl);
