import { EMBLEM_HEIGHT, EMBLEM_HELMET_BOX, EMBLEM_WIDTH } from './emblemPaths';

// Hand-off point for Phase 4 M1. The age gate draws the 2D emblem and publishes where it is on
// screen; M1's 3D emblem lights up in exactly this rectangle, so the click flows into the 3D
// scene without the emblem jumping. Rects are viewport CSS pixels of the full emblem box
// (EMBLEM_WIDTH x EMBLEM_HEIGHT units, helmet and wings).

export interface EmblemRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function createEmblemAnchor() {
  let rect: EmblemRect | null = null;
  const listeners = new Set<() => void>();
  return {
    /** The last rect the gate drew, or null before the gate has painted (or when there is no gate). */
    getSnapshot: (): EmblemRect | null => rect,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish(next: EmblemRect | null): void {
      const same = next && rect && next.x === rect.x && next.y === rect.y && next.width === rect.width && next.height === rect.height;
      if (same || next === rect) return;
      rect = next;
      listeners.forEach(listener => listener());
    },
  };
}

export const emblemAnchor = createEmblemAnchor();

/** Viewport rect of the helmet inside an emblem rect: where a 3D helmet must sit to match. */
export function helmetRect(emblem: EmblemRect): EmblemRect {
  const scale = emblem.width / EMBLEM_WIDTH;
  return {
    x: emblem.x + EMBLEM_HELMET_BOX.x * scale,
    y: emblem.y + EMBLEM_HELMET_BOX.y * scale,
    width: EMBLEM_HELMET_BOX.width * scale,
    height: EMBLEM_HELMET_BOX.height * scale,
  };
}

/** Emblem units to viewport pixels, for placing anything else drawn in emblem coordinates. */
export function emblemPoint(emblem: EmblemRect, x: number, y: number): { readonly x: number; readonly y: number } {
  return { x: emblem.x + (x / EMBLEM_WIDTH) * emblem.width, y: emblem.y + (y / EMBLEM_HEIGHT) * emblem.height };
}
