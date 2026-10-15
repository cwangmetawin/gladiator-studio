// Static, seeded buffers. The renderer uploads them once; there are no per-arch meshes or frame-time allocations.
export type Point = readonly [x: number, y: number, z: number];
export interface ArenaLine {
  readonly kind: 'arcade' | 'attic' | 'cornice' | 'seating' | 'aisle';
  readonly points: readonly Point[];
  readonly gain: number;
  readonly alpha: number;
}
export const ARENA_CENTER: Point = [0, -2.6, 34];
export const ARENA_RADIUS = 24;
export const SAND_RADIUS = 12;
const TAU = Math.PI * 2;

function point(radius: number, angle: number, height: number): Point {
  return [Math.cos(angle) * radius, ARENA_CENTER[1] + height, ARENA_CENTER[2] + Math.sin(angle) * radius];
}

function ring(radius: number, height: number, segments: number): Point[] {
  return Array.from({ length: segments + 1 }, (_, i) => point(radius, i / segments * TAU, height));
}

export function colosseumLines(bays: number): ArenaLine[] {
  if (!Number.isInteger(bays) || bays < 8 || bays > 128) throw new Error('Arena bays must be an integer from 8 to 128');
  const lines: ArenaLine[] = [], step = TAU / bays, start = -Math.PI / 2 - step / 2;
  const add = (kind: ArenaLine['kind'], points: readonly Point[], gain: number, alpha = 0.9): void => {
    lines.push({ kind, points, gain, alpha });
  };
  for (let i = 0; i < bays; i++) {
    const a0 = start + i * step, a1 = a0 + step;
    for (const tier of [{ y: 0, height: 4.2, gain: 1 }, { y: 4.5, height: 3.8, gain: 0.8 }]) {
      const spring = tier.height * 0.58, rise = Math.min(tier.height * 0.36, ARENA_RADIUS * step * 0.5);
      add('arcade', [point(ARENA_RADIUS, a0, tier.y), point(ARENA_RADIUS, a0, tier.y + spring)], tier.gain);
      const arch = Array.from({ length: 11 }, (_, k) => {
        const angle = k / 10 * Math.PI, t = (1 - Math.cos(angle)) / 2;
        return point(ARENA_RADIUS, a0 + (a1 - a0) * t, tier.y + spring + Math.sin(angle) * rise);
      });
      add('arcade', arch, tier.gain);
    }
    if (i % 2 === 0) {
      const aa = a0 + step * 0.3, ab = a0 + step * 0.7;
      add('attic', [aa, ab, ab, aa, aa].map((angle, j) => point(ARENA_RADIUS, angle, j === 1 || j === 2 ? 9.9 : 8.95)), 0.8, 0.8);
    }
  }
  [4.3, 4.42, 8.4, 8.52, 10.6, 10.75].forEach((y, i) => add('cornice', ring(ARENA_RADIUS, y, bays * 4), i % 2 ? 0.7 : 1.2));
  const seatRadius = (k: number): number => SAND_RADIUS + 0.6 + k * (ARENA_RADIUS - SAND_RADIUS - 1.2) / 8;
  for (let k = 0; k <= 8; k++) add('seating', ring(seatRadius(k), 0.5 + k * 1.05, bays * 3), 0.55 + 0.05 * k, 0.75);
  for (let i = 0; i < bays; i += 8) {
    add('aisle', [0, 8].map(k => point(seatRadius(k), start + i * step, 0.5 + k * 1.05)), 0.6, 0.7);
  }
  return lines;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function arenaStars(count: number) {
  const rand = seededRandom(7), positions: number[] = [], uvs: number[] = [], uvs2: number[] = [], indices: number[] = [];
  for (let i = 0; i < count; i++) {
    const y = Math.abs(rand() * 2 - 1) * 0.92 + 0.05, angle = rand() * TAU, horizontal = Math.sqrt(1 - y * y);
    const location: Point = [Math.cos(angle) * horizontal * 600, y * 600, Math.sin(angle) * horizontal * 600];
    const big = rand() < 0.05, size = big ? 2.6 + rand() * 2.2 : 0.9 + rand() * 1.3;
    const brightness = big ? 1.6 + rand() * 1.4 : 0.35 + rand() * 0.9;
    for (const corner of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      positions.push(...location); uvs.push(...corner); uvs2.push(size, brightness);
    }
    const base = i * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, uvs, uvs2, indices };
}
