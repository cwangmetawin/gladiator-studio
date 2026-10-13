import { approachRate, perSecond } from '@/shared/utils/frameTime';
import { createCameraTween, sampleCameraTween, approachCameraPose, type CameraPose, type CameraTween } from '@/shared/motion/cameraTween';
import { transitionTimeline } from '@/shared/motion/tokens';
import type { PanelId, TransitionState } from '@/shared/motion/transition';
import { journeyCameraPose } from '@/features/journey/chapters';

const CAMERA_TARGETS = {
  games: { alpha: -0.6, beta: Math.PI / 2.25, radius: 52 },
  about: { alpha: 0.8, beta: Math.PI / 2.2, radius: 16 },
  team: { alpha: -1.2, beta: Math.PI / 2.8, radius: 15 },
  journey: { alpha: 1.5, beta: Math.PI / 3.5, radius: 20 },
  live: { alpha: 0, beta: Math.PI / 4, radius: 12 },
  careers: { alpha: -0.8, beta: Math.PI / 2, radius: 22 },
  contact: { alpha: 0.3, beta: Math.PI / 1.8, radius: 16 },
} as const;

export interface PlanetPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}

export function panelCameraPose(panel: PanelId, home: CameraPose, planet?: PlanetPose): CameraPose {
  if (panel === 'none') return { ...home };
  const target = CAMERA_TARGETS[panel];
  // Desktop Games keeps its existing wide cosmos view, with no planet pivot.
  const focal = panel === 'games' ? undefined : planet;
  const radius = focal?.radius ?? target.radius;
  const left = ['games', 'about', 'team', 'journey'].includes(panel);
  return {
    ...target, radius, x: focal?.x ?? 0, y: focal?.y ?? 0, z: focal?.z ?? 0,
    screenX: panel === 'games' ? 0 : radius * (left ? 0.30 : -0.30),
  };
}

interface CameraNarrativeOptions {
  readonly read: () => CameraPose;
  readonly write: (pose: CameraPose) => void;
  readonly target: (panel: PanelId) => CameraPose;
  readonly journey: () => { readonly progress: number; readonly count: number };
  readonly isPhone?: () => boolean;
}

/** The store owns wall-clock timing; this adapter owns only the current camera pose. */
export function createCameraNarrative(options: CameraNarrativeOptions) {
  let revision = -1;
  let mode: TransitionState['mode'] | null = null;
  let flight: CameraTween | null = null;
  let journeyTime = 0;

  function sync(state: TransitionState): void {
    if (revision === state.revision && mode === state.mode) return;
    revision = state.revision;
    mode = state.mode;
    journeyTime = 0;
    flight = null;
    if (state.mode === 'phone' || options.isPhone?.()) return;
    const base = options.target(state.target);
    const chapter = options.journey();
    const to = state.mode === 'desktop' && state.target === 'journey' && state.panel === 'journey'
      ? journeyCameraPose(base, chapter.progress, chapter.count) : base;
    if (state.mode === 'reduced') {
      options.write(to); // A single static composition; no motion or scrub.
      return;
    }
    if (state.phase === 'idle') return;
    const t = transitionTimeline(state.mode, state.kind);
    flight = createCameraTween(options.read(), to, state.startedAt + t.cameraAtMs, t.cameraMs);
  }

  function update(state: TransitionState, now: number, dt: number): void {
    sync(state);
    if (state.mode === 'reduced') return;
    if (state.mode === 'phone' || options.isPhone?.()) {
      if (state.phase === 'idle') options.write({ ...options.read(), alpha: options.read().alpha + perSecond(0.00035) * dt });
      return;
    }
    if (flight) {
      options.write(sampleCameraTween(flight, now));
      if (now >= flight.startedAt + flight.durationMs) flight = null;
      return;
    }
    const timeline = transitionTimeline(state.mode, state.kind);
    if (now < state.startedAt + timeline.cameraAtMs + timeline.cameraMs && state.phase !== 'idle') return;
    const pose = options.read();
    if (state.target === 'journey' && state.phase === 'open') {
      const journey = options.journey();
      const target = journeyCameraPose(options.target('journey'), journey.progress, journey.count);
      journeyTime += dt;
      options.write(approachCameraPose(pose, { ...target, alpha: target.alpha + 0.012 * Math.sin(journeyTime * 0.7) }, approachRate(0.10), dt));
    } else {
      options.write({ ...pose, alpha: pose.alpha + perSecond(state.target === 'none' ? 0.00060 : 0.00040) * dt });
    }
  }

  function resume(state: TransitionState, now: number): void {
    if (state.mode !== 'desktop' || options.isPhone?.()) return;
    flight = createCameraTween(options.read(), options.target(state.target), now, transitionTimeline(state.mode, state.kind).cameraMs);
  }

  return { sync, update, resume };
}
