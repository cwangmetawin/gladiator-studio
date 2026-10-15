import { ARENA_CENTER, ARENA_RADIUS, type Point } from './colosseumGeometry';

export const ARENA_GATE_IDS = ['games', 'about', 'team', 'journey', 'live', 'careers', 'contact', 'partner'] as const;
export type ArenaGateId = typeof ARENA_GATE_IDS[number];
export interface PageCameraPose {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  roll: number;
  fov: number;
}
export interface ArenaPageGate {
  readonly id: ArenaGateId;
  readonly label: string;
  readonly bay: number;
  readonly angle: number;
  readonly halfAngle: number;
  readonly floorY: number;
  readonly springY: number;
  readonly crownY: number;
  readonly center: Point;
  readonly outward: Point;
  readonly arch: readonly Point[];
  readonly restPose: PageCameraPose;
}
const LABELS = ['Games', 'About', 'Team', 'Journey', 'Live', 'Careers', 'Contact', 'Client Area'];

/** Uses the very same ground-tier spring and radial crown as colosseumLines, including the wider phone bays. */
export function createPageGates(bays = 64): ArenaPageGate[] {
  if (!Number.isInteger(bays) || bays < 8 || bays > 128 || bays % 8 !== 0) throw new Error('Page gates require 8–128 bays divisible by eight');
  const [cx, floorY, cz] = ARENA_CENTER, step = Math.PI * 2 / bays, halfAngle = step / 2;
  const springY = floorY + 4.2 * 0.58, rise = Math.min(4.2 * 0.36, ARENA_RADIUS * halfAngle);
  const point = (angle: number, y: number): Point => [cx + Math.cos(angle) * ARENA_RADIUS, y, cz + Math.sin(angle) * ARENA_RADIUS];
  return ARENA_GATE_IDS.map((id, index) => {
    const bay = index * bays / 8, a0 = -Math.PI / 2 - halfAngle + bay * step, angle = a0 + halfAngle;
    const arch: Point[] = [point(a0, floorY)];
    for (let k = 0; k <= 10; k++) {
      const crown = k / 10 * Math.PI;
      arch.push(point(a0 + step * (1 - Math.cos(crown)) / 2, springY + Math.sin(crown) * rise));
    }
    arch.push(point(a0 + step, floorY));
    return {
      id, label: LABELS[index]!, bay, angle, halfAngle, floorY, springY, crownY: springY + rise,
      center: point(angle, floorY + 1.35), outward: [Math.cos(angle), 0, Math.sin(angle)], arch,
      restPose: { x: cx + Math.cos(angle) * 9 - Math.sin(angle) * 1.5, y: floorY + 2.2,
        z: cz + Math.sin(angle) * 9 + Math.cos(angle) * 1.5, pitch: -0.055,
        yaw: Math.atan2(-Math.cos(angle), -Math.sin(angle)) + 0.12, roll: 0, fov: 0.9 },
    };
  });
}
