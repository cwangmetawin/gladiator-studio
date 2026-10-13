import { transitionTimeline, type MotionMode, type TransitionKind } from './tokens';

export const PANEL_IDS = ['none', 'games', 'about', 'team', 'journey', 'live', 'careers', 'contact'] as const;
export type PanelId = typeof PANEL_IDS[number];
export type TransitionPhase = 'idle' | 'flying' | 'open' | 'closing';

export interface TransitionState {
  readonly phase: TransitionPhase;
  readonly target: PanelId;
  readonly previousTarget: PanelId;
  /** Keep the currently presented content until the new camera arrives. */
  readonly panel: PanelId;
  readonly mode: MotionMode;
  readonly kind: TransitionKind;
  readonly startedAt: number;
  readonly panelStartedAt: number;
  readonly hubVisible: boolean;
  readonly revision: number;
  /** A catalogue destination carried through the ordinary camera/panel transition. */
  readonly focusGame: string | null;
}

export type TransitionEvent =
  | { readonly type: 'request'; readonly target: PanelId; readonly now: number }
  | { readonly type: 'focus-game'; readonly game: string; readonly now: number }
  | { readonly type: 'tick'; readonly now: number }
  | { readonly type: 'configure'; readonly mode: MotionMode; readonly now: number };

export function isPanelId(value: unknown): value is PanelId {
  return PANEL_IDS.some(id => id === value);
}

export function initialTransition(mode: MotionMode = 'desktop'): TransitionState {
  return {
    phase: 'idle', target: 'none', previousTarget: 'none', panel: 'none',
    mode, kind: 'open', startedAt: 0, panelStartedAt: 0, hubVisible: true, revision: 0, focusGame: null,
  };
}

function request(state: TransitionState, target: PanelId, now: number): TransitionState {
  if (target === state.target) return state;
  const kind = target === 'none' ? 'close' : state.panel === 'none' ? 'open' : 'switch';
  const timeline = transitionTimeline(state.mode, kind);
  const immediate = target !== 'none' && timeline.panelAtMs === 0;
  return {
    ...state, phase: target === 'none' ? 'closing' : 'flying', kind, target,
    previousTarget: state.target, startedAt: now, revision: state.revision + 1,
    focusGame: null,
    panel: immediate ? target : state.panel,
    panelStartedAt: immediate ? now : state.panelStartedAt,
    hubVisible: target === 'none' && timeline.hubAtMs === 0,
  };
}

/** Pure, elapsed-time state machine: a stale tick can never select an old target. */
export function transitionReducer(state: TransitionState, event: TransitionEvent): TransitionState {
  if (event.type === 'focus-game') {
    const game = event.game.trim();
    if (!game) return state;
    const next = request(state, 'games', event.now);
    return next.focusGame === game ? next : { ...next, focusGame: game };
  }
  if (event.type === 'request') return request(state, event.target, event.now);
  if (event.type === 'configure') {
    if (event.mode === state.mode) return state;
    const configured = { ...state, mode: event.mode };
    if (state.phase === 'idle') return configured;
    // Restart from the presented panel and actual camera pose on preference/resize changes.
    const timeline = transitionTimeline(event.mode, state.kind);
    return {
      ...configured, phase: state.target === 'none' ? 'closing' : 'flying',
      startedAt: event.now, revision: state.revision + 1,
      panel: state.target !== 'none' && timeline.panelAtMs === 0 ? state.target : state.panel,
      panelStartedAt: event.now + timeline.panelAtMs,
      hubVisible: state.target === 'none' && timeline.hubAtMs === 0,
    };
  }
  if (state.phase === 'idle' || state.phase === 'open') return state;
  const timeline = transitionTimeline(state.mode, state.kind);
  const elapsed = Math.max(0, event.now - state.startedAt);
  if (elapsed >= timeline.totalMs) {
    return {
      ...state, phase: state.target === 'none' ? 'idle' : 'open', panel: state.target,
      panelStartedAt: state.startedAt + timeline.panelAtMs, hubVisible: state.target === 'none',
    };
  }
  if (state.target !== 'none' && elapsed >= timeline.panelAtMs
    && (state.panel !== state.target || state.panelStartedAt < state.startedAt)) {
    return { ...state, panel: state.target, panelStartedAt: state.startedAt + timeline.panelAtMs };
  }
  if (state.target === 'none' && elapsed >= timeline.hubAtMs && !state.hubVisible) {
    return { ...state, hubVisible: true };
  }
  return state;
}

export function nextTransitionDeadline(state: TransitionState): number | null {
  if (state.phase === 'idle' || state.phase === 'open') return null;
  const t = transitionTimeline(state.mode, state.kind);
  if (state.target !== 'none' && (state.panel !== state.target || state.panelStartedAt < state.startedAt)) {
    return state.startedAt + t.panelAtMs;
  }
  if (state.target === 'none' && !state.hubVisible) return state.startedAt + t.hubAtMs;
  return state.startedAt + t.totalMs;
}
