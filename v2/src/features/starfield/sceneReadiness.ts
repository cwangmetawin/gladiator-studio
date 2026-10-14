/**
 * module: Babylon is loaded. scene: the starfield scene is built. frame: it has drawn a complete frame.
 * home: the first screen can take over from the age gate: the 3D emblem has drawn its first frame, or no
 * 3D emblem is coming (no WebGL, or the arena failed to load) and the flat one stands in.
 */
export type SceneMilestone = 'module' | 'scene' | 'frame' | 'home';

const ORDER: readonly SceneMilestone[] = ['module', 'scene', 'frame', 'home'];

/** One small external store, shared by preloading, the scene and the age gate's hand-off. */
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
