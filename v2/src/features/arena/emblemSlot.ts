import type { Rect } from './framing';

// Where the page wants the 3D emblem: the DOM's emblem slot, measured by ArenaHero and published here so
// the scene can frame it without touching the DOM. `stage` is the first screen's room for the hero
// (everything but the bar, the headline and the details), the denominator of the stage share.

export interface SlotState {
  /** The slot's rectangle, and how much of its width the emblem takes (a phone's emblem is wider than the slot, its wing tips run off both edges). */
  readonly slot: Rect;
  readonly fraction: number;
  readonly stage: Rect;
  readonly viewport: { readonly width: number; readonly height: number };
}

export function createEmblemSlot() {
  let state: SlotState | null = null;
  const listeners = new Set<() => void>();
  const same = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  return {
    getSnapshot: (): SlotState | null => state,
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    publish(next: SlotState | null): void {
      if (next === state) return;
      if (next && state && same(next.slot, state.slot) && same(next.stage, state.stage) && next.fraction === state.fraction
        && next.viewport.width === state.viewport.width && next.viewport.height === state.viewport.height) return;
      state = next;
      listeners.forEach(listener => listener());
    },
  };
}

export const emblemSlot = createEmblemSlot();
