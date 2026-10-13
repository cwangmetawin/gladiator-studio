export type MotionMode = 'desktop' | 'phone' | 'reduced';
export type TransitionKind = 'open' | 'switch' | 'close';

/** All narrative timings are milliseconds; convert only at the Framer boundary. */
export const motionTokens = Object.freeze({
  feedbackMs: 80,
  flightMs: 420,
  frameMs: 160,
  eyebrowDelayMs: 40,
  titleDelayMs: 80,
  bodyDelayMs: 120,
  revealMs: 180,
  hubDimMs: 160,
  hubReturnMs: 180,
  phoneFeedbackMs: 60,
  phonePanelMs: 180,
  phoneHubMs: 60,
  reducedFadeMs: 120,
  ease: cameraEase,
  cssEase: 'cubic-bezier(0.65, 0, 0.35, 1)',
});

export interface TransitionTimeline {
  readonly feedbackMs: number;
  readonly cameraAtMs: number;
  readonly cameraMs: number;
  readonly panelAtMs: number;
  readonly frameMs: number;
  readonly eyebrowDelayMs: number;
  readonly titleDelayMs: number;
  readonly bodyDelayMs: number;
  readonly revealMs: number;
  readonly exitMs: number;
  readonly hubAtMs: number;
  readonly hubMs: number;
  readonly totalMs: number;
}

export function transitionTimeline(mode: MotionMode, kind: TransitionKind): TransitionTimeline {
  const t = motionTokens;
  if (mode !== 'desktop') {
    const reduced = mode === 'reduced';
    const feedbackMs = reduced || kind !== 'open' ? 0 : t.phoneFeedbackMs;
    const frameMs = reduced ? t.reducedFadeMs : t.phonePanelMs;
    const hubAtMs = kind === 'close' && !reduced ? frameMs : 0;
    const hubMs = reduced ? t.reducedFadeMs : t.phoneHubMs;
    return {
      feedbackMs, cameraAtMs: 0, cameraMs: 0, panelAtMs: feedbackMs,
      frameMs, eyebrowDelayMs: 0, titleDelayMs: 0, bodyDelayMs: 0,
      revealMs: 0, exitMs: frameMs, hubAtMs, hubMs,
      totalMs: kind === 'close' ? hubAtMs + hubMs : feedbackMs + frameMs,
    };
  }
  const feedbackMs = kind === 'open' ? t.feedbackMs : 0;
  const cameraAtMs = kind === 'close' ? t.frameMs : feedbackMs;
  const arrivalMs = cameraAtMs + t.flightMs;
  return {
    feedbackMs, cameraAtMs, cameraMs: t.flightMs, panelAtMs: arrivalMs,
    frameMs: t.frameMs, eyebrowDelayMs: t.eyebrowDelayMs,
    titleDelayMs: t.titleDelayMs, bodyDelayMs: t.bodyDelayMs,
    revealMs: t.revealMs, exitMs: t.frameMs,
    hubAtMs: arrivalMs, hubMs: t.hubReturnMs,
    totalMs: kind === 'close' ? arrivalMs + t.hubReturnMs : arrivalMs + t.bodyDelayMs + t.revealMs,
  };
}

export function cameraEase(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}
