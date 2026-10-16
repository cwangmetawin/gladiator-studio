import { useEffect, useRef } from 'react';
import { useMotionPreference } from '@/shared/motion/useMotionPreference';
import { decodeFrame } from './editorialMotion';

/** Animate only the visible key node; clipboard values never come from the animation. */
export function DecodedKey({ value, revealed, children }: { readonly value: string; readonly revealed: boolean; readonly children: string }) {
  const reducedMotion = useMotionPreference();
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = text.current;
    if (node) node.textContent = children;
    if (!revealed || reducedMotion || !node || typeof requestAnimationFrame !== 'function') return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 400);
      node.textContent = decodeFrame(value, progress, reducedMotion);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    node.textContent = decodeFrame(value, 0, reducedMotion);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); };
  }, [value, revealed, reducedMotion, children]);
  return <><span ref={text} aria-hidden="true">{children}</span><span className="partner__sr-only">{children}</span></>;
}

