import { createContext } from 'react';
import type { MotionMode, TransitionTimeline } from './tokens';

export type RevealStage = 'eyebrow' | 'title' | 'body';
export interface PanelMotion {
  readonly mode: MotionMode;
  readonly timeline: TransitionTimeline;
  readonly enteredAt: number;
  readonly settled: boolean;
  readonly instantContent: boolean;
}

export const PanelMotionContext = createContext<PanelMotion | null>(null);
