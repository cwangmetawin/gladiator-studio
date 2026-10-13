'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import { useMotionPreference } from '@/shared/motion/useMotionPreference';
import { PanelMotionContext } from '@/shared/motion/panelMotion';

interface CountUpProps {
  readonly to: number;
  readonly decimals?: number;
  readonly suffix?: string;
  readonly prefix?: string;
  readonly duration?: number;
  readonly className?: string;
}

/** Animated number that counts up from 0 the first time it scrolls into view. */
export function CountUp({ to, decimals = 0, suffix = '', prefix = '', duration = 1400, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reducedMotion = useMotionPreference();
  const panel = useContext(PanelMotionContext);
  const instant = reducedMotion || panel?.instantContent || panel?.settled;
  const counterDuration = panel ? panel.timeline.revealMs : duration;
  const [value, setValue] = useState(0);
  const currentValue = useRef(0);

  useEffect(() => {
    if (instant) {
      currentValue.current = to;
      setValue(to);
      return;
    }
    if (!inView) return;
    let raf = 0;
    let start = 0;
    const from = currentValue.current;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / Math.max(1, counterDuration), 1);
      currentValue.current = from + (to - from) * ease(p);
      setValue(currentValue.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, counterDuration, instant]);

  return (
    <span ref={ref} className={className}>
      {prefix}{(instant ? to : value).toFixed(decimals)}{suffix}
    </span>
  );
}
