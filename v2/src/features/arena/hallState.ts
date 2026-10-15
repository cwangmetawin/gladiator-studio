import type { Game } from '@/shared/types/game';
import type { HallCover } from './hallManifest';

export interface HallItem { readonly game: Game; readonly cover: HallCover; readonly compact?: boolean }

function signal<T>(initial: T) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: (): T => snapshot,
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    publish(value: T): void {
      if (snapshot === value) return;
      snapshot = value;
      listeners.forEach(listener => listener());
    },
  };
}

// Data crosses the existing DOM/scene boundary, never a new canvas or a new animation loop.
export const hallContent = signal<readonly HallItem[]>([]);
export const hallDrawn = signal(false);
