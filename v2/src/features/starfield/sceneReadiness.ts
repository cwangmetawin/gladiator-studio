export type SceneMilestone = 'module' | 'scene' | 'frame';

const ORDER: readonly SceneMilestone[] = ['module', 'scene', 'frame'];

/** One small external store, shared by preloading, the scene and the intro. */
export function createSceneReadiness() {
  let snapshot: SceneMilestone | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: SceneMilestone | null): void => {
    if (next === snapshot) return;
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    mark(milestone: SceneMilestone): void {
      if (snapshot === null || ORDER.indexOf(milestone) > ORDER.indexOf(snapshot)) publish(milestone);
    },
    // A remounted canvas needs its own ready frame, even if the chunk is cached.
    resetScene(): void { publish(snapshot === null ? null : 'module'); },
  };
}

export const sceneReadiness = createSceneReadiness();
