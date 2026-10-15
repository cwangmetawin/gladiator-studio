import { useEffect, useState } from 'react';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts from 0 to `end` after `delay` ms (instantly with reduced motion). Only the stat that uses it re-renders. */
export function useCountUp(end: number, delay: number, duration = 1500): number {
  // With reduced motion the very first paint already shows the final number (no frame of 0).
  const [value, setValue] = useState(() => (prefersReducedMotion() ? end : 0));
  useEffect(() => {
    if (prefersReducedMotion()) { setValue(end); return; }
    let raf = 0;
    let startTs = 0;
    const ease = (t: number): number => 1 - Math.pow(1 - t, 4);
    const timer = setTimeout(() => {
      const step = (ts: number): void => {
        if (!startTs) startTs = ts;
        const p = Math.min((ts - startTs) / duration, 1);
        setValue(end * ease(p));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [end, delay, duration]);
  return value;
}
