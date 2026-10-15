import type { Framing } from './framing';
import { createPchip, type Knot } from './pchip';
import { DIVE_SCREENS, JOURNEY_SCREENS } from './journeyProgress';

export interface CameraPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly fov: number;
  readonly pitch: number;
}

export interface CameraFraming extends Framing {
  readonly fov: number;
  /** The mouth's centre relative to the emblem's root, in baked world units. */
  readonly mouthY: number;
}

/** Find the gap below the central visor stem from the baked cap, without parsing the SVG at runtime. */
export function helmetMouthY(positions: Float32Array): number {
  let stem = Infinity, bottom = Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1]!;
    bottom = Math.min(bottom, y);
    if (Math.abs(positions[i]!) < 0.08) stem = Math.min(stem, y);
  }
  if (!Number.isFinite(stem) || !Number.isFinite(bottom)) throw new Error('Emblem has no central helmet opening');
  return (stem + bottom) / 2;
}

/** Prepare once per framing change. Sampling has no clock, pointer, scroll direction or mutable state. */
export function createCameraTrack(frame: CameraFraming): (screens: number) => CameraPose {
  const gap = frame.offsetY + frame.mouthY;
  const dive = (keys: readonly Knot[]) => keys.map(([p, value]) => [p * DIVE_SCREENS, value] as const);
  const x = createPchip(dive([[0, 0], [0.45, frame.offsetX], [0.76, frame.offsetX], [1, 0]]));
  const z = createPchip([...dive([
    [0, -frame.distance], [0.45, -Math.min(2.7, frame.distance * 0.45)],
    [0.62, -Math.min(1.05, frame.distance * 0.18)], [0.76, 1.1], [1, 15.5],
  ]), [JOURNEY_SCREENS, 16.9]]);
  const y = createPchip([...dive([[0, 0], [0.45, gap * 0.88], [0.62, gap], [0.76, gap + 0.05], [1, 3.3]]), [JOURNEY_SCREENS, 2.8]]);
  const fov = createPchip(dive([[0, frame.fov], [0.45, frame.fov * 1.03], [0.62, frame.fov * 1.12],
    [0.7, frame.fov * 1.6], [0.8, 0.95], [1, 0.82]]));
  const pitch = createPchip([[0, 0], [0.76 * DIVE_SCREENS, 0], [DIVE_SCREENS, 0.035], [JOURNEY_SCREENS, 0.065]]);
  return (screens: number): CameraPose => ({ x: x(screens), y: y(screens), z: z(screens), fov: fov(screens), pitch: pitch(screens) });
}
