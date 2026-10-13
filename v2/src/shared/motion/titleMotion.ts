import { motionTokens, type MotionMode, type TransitionTimeline } from './tokens';

export function panelTitleTiming(mode: MotionMode, timeline: TransitionTimeline) {
  if (mode === 'reduced') return { delayMs: 0, durationMs: motionTokens.reducedFadeMs };
  if (mode === 'phone') {
    // Finish within phonePanelMs, after its immediate eyebrow and before the frame settles.
    return { delayMs: motionTokens.phoneFeedbackMs / 2, durationMs: motionTokens.phonePanelMs - motionTokens.phoneHubMs };
  }
  return { delayMs: timeline.titleDelayMs, durationMs: timeline.revealMs };
}

// The heading's line-height is 1.05, so descenders and glyph overhang paint outside its box.
// The clip therefore rests outside the box on every side; only the bottom edge wipes down.
const TITLE_CLIP_HIDDEN = 'inset(-12% -6% 112% -6%)';
const TITLE_CLIP_SHOWN = 'inset(-12% -6% -30% -6%)';

/** Paint-only properties keep the final typography and line wrapping unchanged. */
export function panelTitleReveal(mode: MotionMode, timeline: TransitionTimeline) {
  const timing = panelTitleTiming(mode, timeline);
  if (mode === 'reduced') return { ...timing, initial: { opacity: 0 }, animate: { opacity: 1 } };
  return {
    ...timing,
    initial: { opacity: 0, y: 8, clipPath: TITLE_CLIP_HIDDEN },
    animate: { opacity: 1, y: 0, clipPath: TITLE_CLIP_SHOWN },
  };
}
