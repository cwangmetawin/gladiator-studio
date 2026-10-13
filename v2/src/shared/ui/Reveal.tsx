'use client';

import { motion } from 'framer-motion';
import { useContext, type ReactNode } from 'react';
import { PanelMotionContext, type RevealStage } from '@/shared/motion/panelMotion';
import { motionTokens } from '@/shared/motion/tokens';
import { useMotionPreference } from '@/shared/motion/useMotionPreference';

const EXPO = [0.16, 1, 0.3, 1] as const;

interface RevealProps {
  readonly children: ReactNode;
  readonly delay?: number;
  readonly y?: number;
  readonly className?: string;
  readonly stage?: RevealStage;
}

/**
 * Scroll-reveal wrapper — fades + lifts its child into view the first time it
 * enters the viewport. Honors prefers-reduced-motion via the app's MotionConfig.
 * Used to cascade a section's blocks in as the panel scrolls.
 */
export function Reveal({ children, delay = 0, y = 18, className, stage = 'body' }: RevealProps) {
  const panel = useContext(PanelMotionContext);
  const reducedMotion = useMotionPreference();
  if (panel || reducedMotion) {
    const instant = reducedMotion || panel?.instantContent || panel?.settled;
    const timeline = panel?.timeline;
    const stageDelay = timeline ? stage === 'eyebrow' ? timeline.eyebrowDelayMs : stage === 'title' ? timeline.titleDelayMs : timeline.bodyDelayMs : 0;
    const delayMs = instant ? 0 : Math.max(0, (panel?.enteredAt ?? 0) + stageDelay - performance.now());
    return (
      <motion.div
        data-reveal-static={instant || undefined}
        className={className} initial={instant ? false : { opacity: 0, y }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: instant ? 0 : (timeline?.revealMs ?? 0) / 1000, delay: delayMs / 1000, ease: motionTokens.ease }}
      >
        {children}
      </motion.div>
    );
  }
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
