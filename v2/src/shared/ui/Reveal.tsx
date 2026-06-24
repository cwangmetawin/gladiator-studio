'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

const EXPO = [0.16, 1, 0.3, 1] as const;

interface RevealProps {
  readonly children: ReactNode;
  readonly delay?: number;
  readonly y?: number;
  readonly className?: string;
}

/**
 * Scroll-reveal wrapper — fades + lifts its child into view the first time it
 * enters the viewport. Honors prefers-reduced-motion via the app's MotionConfig.
 * Used to cascade a section's blocks in as the panel scrolls.
 */
export function Reveal({ children, delay = 0, y = 18, className }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, delay, ease: EXPO }}
    >
      {children}
    </motion.div>
  );
}
