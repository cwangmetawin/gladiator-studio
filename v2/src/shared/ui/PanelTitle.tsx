import { useContext, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { PanelMotionContext } from '@/shared/motion/panelMotion';
import { panelTitleReveal } from '@/shared/motion/titleMotion';
import { motionTokens } from '@/shared/motion/tokens';
import { useMotionPreference } from '@/shared/motion/useMotionPreference';

/** Keep one intact heading; the wrapper alone performs the masked line reveal. */
export function PanelTitle({ children }: { readonly children: ReactNode }) {
  const panel = useContext(PanelMotionContext);
  const reducedMotion = useMotionPreference();
  if (!panel) return children;
  const mode = reducedMotion ? 'reduced' : panel.mode;
  const reveal = panelTitleReveal(mode, panel.timeline);
  const now = performance.now();
  const end = panel.enteredAt + reveal.delayMs + reveal.durationMs;
  const settled = panel.settled || now >= end;
  return (
    <motion.div
      key={mode} data-title-reveal={mode}
      initial={settled ? false : reveal.initial} animate={reveal.animate}
      transition={{ duration: settled ? 0 : Math.min(reveal.durationMs, Math.max(0, end - now)) / 1000,
        delay: settled ? 0 : Math.max(0, panel.enteredAt + reveal.delayMs - now) / 1000, ease: motionTokens.ease }}
    >
      {children}
    </motion.div>
  );
}
