import { frameDeltaSeconds } from '@/shared/utils/frameTime';

/** Games is translucent on both layouts; other phone panels and overlays cover the sky. */
export function isSceneCovered(playing: boolean, clientAreaOpen: boolean, phone: boolean, panel: string): boolean {
  return playing || clientAreaOpen || (phone && panel !== 'none' && panel !== 'games');
}

interface RenderState {
  readonly reducedMotion: boolean;
  readonly hidden: boolean;
  readonly suspended: boolean;
}

export function shouldRunRenderLoop(state: RenderState): boolean {
  return !state.reducedMotion && !state.hidden && !state.suspended;
}

interface RenderLoopOptions {
  readonly getState: () => RenderState;
  readonly getDeltaTime: () => number;
  readonly render: (dt: number) => void;
  readonly start: (render: () => void) => void;
  readonly stop: () => void;
}

/** Share the same freeze/resume path for preferences, visibility and overlays. */
export function createRenderLoop(options: RenderLoopOptions) {
  let disposed = false;
  let firstFrame = true;

  const renderStatic = (): void => {
    if (!disposed) options.render(0);
  };

  const renderFrame = (): void => {
    if (disposed || !shouldRunRenderLoop(options.getState())) return;
    // The engine's first delta can include the entire suspended interval.
    const dt = firstFrame ? 0 : frameDeltaSeconds(options.getDeltaTime());
    firstFrame = false;
    options.render(dt);
  };

  const startLoop = (): void => {
    options.stop();
    if (disposed) return;
    firstFrame = true;
    // Paint the final frozen frame, or refresh it immediately before resuming.
    renderStatic();
    if (shouldRunRenderLoop(options.getState())) options.start(renderFrame);
  };

  const dispose = (): void => {
    disposed = true;
    options.stop();
  };

  return { startLoop, renderStatic, dispose };
}
