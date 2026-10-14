import { EMBLEM_FEATHER_EDGES, EMBLEM_HELMET_BOX } from './emblemPaths';

// The gate emblem's idle life: one electric arc at a time races along a feather's top edge,
// every 2.6-4.2 s (the Phase 4 plan's arc timing), each lasting ARC_FLASH_MS.

export const ARC_FLASH_MS = 300;
export const ARC_FIRST_MS = 900;
export const ARC_MIN_GAP_MS = 2600;
export const ARC_MAX_GAP_MS = 4200;
/** An arc's box in emblem units: the feather edge runs ARC_EDGE_Y below its top. */
export const ARC_BOX_HEIGHT = 34;
export const ARC_EDGE_Y = 24;

/** The breathing spark sits on the helmet's nose guard, at the emblem's centre line. */
export const SPARK = { x: EMBLEM_HELMET_BOX.x + EMBLEM_HELMET_BOX.width / 2, y: 112 } as const;

export interface ArcGeometry {
  readonly feather: number;
  /** Box in emblem units; the arc starts at its inner end (local x = 0) and races outwards. */
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly angleDeg: number;
  /** Left-wing feathers are mirrored so the race still runs from the helmet outwards. */
  readonly mirrored: boolean;
  /** Two jitters of the same bolt; alternating them reads as crackle. */
  readonly bolts: readonly [string, string];
}

type Point = readonly [number, number];

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Midpoint displacement between two points, biased upwards so the bolt rides on the edge. */
function displace(from: Point, to: Point, levels: number, roughness: number, next: () => number, top: number): Point[] {
  let points: Point[] = [from, to];
  for (let level = 0; level < levels; level++) {
    const refined: Point[] = [points[0] ?? from];
    for (let k = 1; k < points.length; k++) {
      const a = points[k - 1] ?? from, b = points[k] ?? to;
      const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const lift = (next() - 0.62) * span * roughness;
      const y = Math.min(ARC_EDGE_Y + 1.5, Math.max(top, (a[1] + b[1]) / 2 + lift));
      refined.push([(a[0] + b[0]) / 2, y], b);
    }
    points = refined;
  }
  return points;
}

const path = (points: readonly Point[]): string =>
  points.map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

/** One bolt along [0, length] with one or two forward forks, as SVG path data. Deterministic. */
export function arcBolt(length: number, seed: number): string {
  const next = random(seed);
  const main = displace([0, ARC_EDGE_Y], [length, ARC_EDGE_Y], 5, 0.07, next, ARC_EDGE_Y - 11);
  const forks = [0.3 + next() * 0.15, 0.58 + next() * 0.15].slice(0, next() < 0.5 ? 1 : 2).map(at => {
    const start = main[Math.round(at * (main.length - 1))] ?? main[0] ?? [0, ARC_EDGE_Y];
    const reach = length * (0.12 + next() * 0.08);
    const end: Point = [start[0] + reach, Math.max(2, start[1] - reach * (0.28 + next() * 0.22))];
    return path(displace(start, end, 3, 0.18, next, 1));
  });
  return path(main) + forks.join('');
}

/** Where each feather's arc runs: from 6 % in from the inner end to 4 % short of the tip. */
export function arcGeometry(feather: number): ArcGeometry {
  const edge = EMBLEM_FEATHER_EDGES[feather];
  if (!edge) throw new Error(`no feather ${feather}`);
  const mirrored = feather % 2 === 1;
  const span = edge.x1 - edge.x0;
  // 6 % clear of the helmet end, 4 % short of the tip; left-wing feathers have their tip on the left.
  const leftInset = mirrored ? 0.04 : 0.06, rightInset = mirrored ? 0.06 : 0.04;
  const x0 = edge.x0 + span * leftInset, x1 = edge.x1 - span * rightInset;
  const slope = (edge.y1 - edge.y0) / span;
  const length = Math.hypot(x1 - x0, slope * (x1 - x0));
  return {
    feather, mirrored, length,
    x: x0, y: edge.y0 + slope * (x0 - edge.x0) - ARC_EDGE_Y,
    angleDeg: (Math.atan(slope) * 180) / Math.PI,
    bolts: [arcBolt(length, 1009 * (feather + 1)), arcBolt(length, 7919 * (feather + 1))],
  };
}

export const ARC_FEATHERS: readonly number[] = EMBLEM_FEATHER_EDGES.map((_edge, index) => index);

/** The next arc: never the same feather twice in a row, after a 2.6-4.2 s gap. */
export function nextArc(next: () => number, previous: number | null): { readonly feather: number; readonly waitMs: number } {
  const choices = ARC_FEATHERS.filter(feather => feather !== previous);
  const feather = choices[Math.min(choices.length - 1, Math.floor(next() * choices.length))] ?? 0;
  return { feather, waitMs: Math.round(ARC_MIN_GAP_MS + next() * (ARC_MAX_GAP_MS - ARC_MIN_GAP_MS)) };
}
