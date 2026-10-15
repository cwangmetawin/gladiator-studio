import { ARC_FIRST_MS, ARC_FLASH_MS, nextArc } from '@/shared/brand/emblemArcs';

// When the 3D emblem's arcs fire. The gate's 2D emblem and the 3D one share this rhythm (nextArc):
// one arc at a time, never the same feather twice running, 2.6-4.2 s apart, each lasting ARC_FLASH_MS.

export interface ArcScheduler {
  /** Milliseconds since the emblem's opening. Returns the feather that fires now, or null. */
  poll(elapsedMs: number): number | null;
}

export function createArcScheduler(random: () => number, firstMs: number = ARC_FIRST_MS): ArcScheduler {
  let nextAt = firstMs;
  let previous: number | null = null;
  return {
    poll(elapsedMs: number): number | null {
      if (elapsedMs < nextAt) return null;
      const { feather, waitMs } = nextArc(random, previous);
      previous = feather;
      // waitMs is at least 2.6 s, far above ARC_FLASH_MS: an arc has ended before the next one starts.
      nextAt = elapsedMs + Math.max(waitMs, ARC_FLASH_MS + 1);
      return feather;
    },
  };
}

export { ARC_FLASH_MS };
