import { ARENA_CENTER, ARENA_RADIUS } from './colosseumGeometry';
import { createPchip } from './pchip';
import type { ArenaPageGate, PageCameraPose } from './pageGates';

export type { PageCameraPose } from './pageGates';
type Channel = keyof PageCameraPose;
export interface PageFlightMouth { readonly x: number; readonly y: number }
const CHANNELS: readonly Channel[] = ['x', 'y', 'z', 'pitch', 'yaw', 'roll', 'fov'];
export interface PageFlight {
  readonly start: PageCameraPose;
  readonly end: PageCameraPose;
  readonly gateAt: number;
  readonly joins: readonly number[];
  readonly tracks: Readonly<Record<Channel, (progress: number) => number>>;
}

export function pageFlightTiming(phone: boolean, reduced: boolean) {
  if (reduced) return { durationMs: 0, titleAtMs: 0, bodyAtMs: 0 };
  // The shell starts its title on landing, then completes the body's 80 ms delay + 100 ms reveal.
  return phone ? { durationMs: 980, titleAtMs: 980, bodyAtMs: 1160 }
    : { durationMs: 1280, titleAtMs: 1280, bodyAtMs: 1460 };
}

export function pageFlightProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  if (Number.isNaN(elapsedMs)) return 0;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}

function nearestAngle(angle: number, reference: number): number {
  return reference + Math.atan2(Math.sin(angle - reference), Math.cos(angle - reference));
}

/** Setup-only allocations. PCHIP keeps velocity continuous at the route joins and still settles exactly at rest. */
export function createPageFlight(input: PageCameraPose, gate: ArenaPageGate, phone = false, mouth?: PageFlightMouth): PageFlight {
  const start = { ...input }, end = { ...gate.restPose, yaw: nearestAngle(gate.restPose.yaw, input.yaw) };
  const [cx, , cz] = ARENA_CENTER, radius = Math.hypot(start.x - cx, start.z - cz);
  const eyeY = gate.center[1], gateAt = phone ? 0.7 : 0.76;
  const inwardYaw = nearestAngle(Math.atan2(-gate.outward[0], -gate.outward[2]), end.yaw);
  const keys: [number, PageCameraPose][] = [[0, start]];
  const at = (r: number, angle: number, y: number, yaw: number, roll = 0): PageCameraPose => ({
    x: cx + Math.cos(angle) * r, y, z: cz + Math.sin(angle) * r, pitch: 0, yaw, roll, fov: 0.94,
  });
  const turn = nearestAngle(gate.angle, Math.atan2(start.z - cz, start.x - cx));
  const bank = phone ? 0.012 : 0.025;
  if (mouth && start.z < 1.2) {
    // The emblem is real foreground geometry: reach its empty mouth before turning toward a page.
    // Revealing the exterior while orbiting from the original depth made it look like a hard scene cut.
    const mouthPose = { ...start, x: mouth.x, y: mouth.y, z: Math.max(0.4, start.z + 0.05),
      pitch: 0, yaw: nearestAngle(0, start.yaw), roll: 0, fov: Math.max(start.fov, 0.94) };
    keys.push([0.16, mouthPose], [0.25, { ...mouthPose, z: 4, fov: 0.94 }]);
    const from = Math.atan2(4 - cz, mouth.x - cx), angleDistance = nearestAngle(gate.angle, from) - from;
    const segments = Math.max(1, Math.ceil(Math.abs(angleDistance) / (Math.PI / 6)));
    for (let i = 1; i <= segments; i++) {
      const fraction = i / segments, angle = from + angleDistance * fraction;
      keys.push([0.25 + fraction * 0.32, at(31, angle,
        mouth.y + (eyeY - mouth.y) * fraction,
        nearestAngle(-angle - Math.PI / 2, mouthPose.yaw), -bank * Math.sin(fraction * Math.PI))]);
    }
  } else if (radius < ARENA_RADIUS - 0.5) {
    // A switch first clears the target doorway outward, then turns on the exterior landing and enters it.
    // The outward heading is selected relative to the final yaw, so a wrap at ±π never adds a full revolution.
    const outwardYaw = inwardYaw + (inwardYaw < start.yaw ? Math.PI : -Math.PI);
    keys.push([0.18, at(18.5, gate.angle, eyeY, outwardYaw, bank)],
      [0.32, at(ARENA_RADIUS, gate.angle, eyeY, outwardYaw)],
      [0.48, at(31, gate.angle, eyeY + 0.22, inwardYaw, -bank)]);
  } else {
    const from = Math.atan2(start.z - cz, start.x - cx), angleDistance = turn - from;
    const outside = Math.max(radius, ARENA_RADIUS + (phone ? 6 : 8));
    const segments = Math.max(1, Math.ceil(Math.abs(angleDistance) / (Math.PI / 6)));
    keys.push([0.1, { ...start, y: start.y + 0.12, fov: start.fov + 0.025, roll: bank * Math.sign(angleDistance) }]);
    keys.push([0.16, at(outside, from, start.y * 0.65 + eyeY * 0.35, nearestAngle(-from - Math.PI / 2, start.yaw))]);
    for (let i = 1; i <= segments; i++) {
      const fraction = i / segments, angle = from + angleDistance * fraction;
      keys.push([0.16 + fraction * 0.37, at(outside, angle,
        start.y * (1 - fraction) + eyeY * fraction,
        nearestAngle(-angle - Math.PI / 2, start.yaw + (inwardYaw - start.yaw) * fraction), -bank * Math.sin(fraction * Math.PI))]);
    }
  }
  keys.push([gateAt - 0.1, at(29, gate.angle, eyeY, inwardYaw)],
    [gateAt, at(ARENA_RADIUS, gate.angle, eyeY, inwardYaw)],
    [gateAt + 0.08, at(19, gate.angle, eyeY, inwardYaw)], [1, end]);
  const tracks = Object.fromEntries(CHANNELS.map(channel => [channel,
    createPchip(keys.map(([time, pose]) => [time, pose[channel]] as const)),
  ])) as Record<Channel, (progress: number) => number>;
  return { start, end, gateAt, joins: keys.slice(1, -1).map(([time]) => time), tracks };
}

/** The caller supplies storage; sampling forward, backward or at an interruption never creates a pose. */
export function samplePageFlight(path: PageFlight, progress: number, out: PageCameraPose): void {
  const p = Number.isNaN(progress) ? 0 : Math.min(1, Math.max(0, progress));
  if (p === 0 || p === 1) {
    const pose = p === 0 ? path.start : path.end;
    out.x = pose.x; out.y = pose.y; out.z = pose.z; out.pitch = pose.pitch;
    out.yaw = pose.yaw; out.roll = pose.roll; out.fov = pose.fov;
    return;
  }
  const track = path.tracks;
  out.x = track.x(p); out.y = track.y(p); out.z = track.z(p); out.pitch = track.pitch(p);
  out.yaw = track.yaw(p); out.roll = track.roll(p); out.fov = track.fov(p);
}

/** A bounded dolly inside the sand ring, never a rotation; body text remains steady while the arena has depth. */
export function samplePageScroll(rest: PageCameraPose, scrollProgress: number, out: PageCameraPose): void {
  const p = Number.isFinite(scrollProgress) ? Math.min(1, Math.max(0, scrollProgress)) : 0;
  const eased = p * p * (3 - 2 * p), distance = eased * 1.2;
  out.x = rest.x + Math.sin(rest.yaw) * distance;
  out.y = rest.y + eased * 0.16;
  out.z = rest.z + Math.cos(rest.yaw) * distance;
  out.pitch = rest.pitch; out.yaw = rest.yaw; out.roll = rest.roll; out.fov = rest.fov;
}
