import { createContext } from 'react';
import type { TransitionTimeline } from './tokens';

export type RevealStage = 'eyebrow' | 'title' | 'body';
export interface PanelMotion {
  readonly timeline: TransitionTimeline;
  readonly enteredAt: number;
  readonly settled: boolean;
  readonly instantContent: boolean;
}

export const PanelMotionContext = createContext<PanelMotion | null>(null);
