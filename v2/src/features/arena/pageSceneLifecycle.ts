import type { Engine, Mesh } from './arenaTypes';

/** Never remove the SVG fallback until the page materials have compiled on the live engine. */
export function createPageSceneLifecycle(engine: Engine, meshes: readonly Mesh[], isReady: () => boolean,
  publish: (available: boolean) => void, requestStatic: () => void) {
  let disposed = false, lost = false, warmed = false, generation = 0;
  const sync = (): void => publish(!disposed && !lost && warmed && isReady());
  async function warm(): Promise<boolean> {
    const revision = ++generation;
    warmed = false; sync();
    try {
      await Promise.all(meshes.map(mesh => mesh.material?.forceCompilationAsync(mesh)));
    } catch {
      if (!disposed && revision === generation) { sync(); requestStatic(); }
      return false;
    }
    if (disposed || lost || revision !== generation) return false;
    warmed = true; sync(); requestStatic(); return true;
  }
  const contextLost = engine.onContextLostObservable.add(() => {
    lost = true; warmed = false; generation++; sync();
  });
  const contextRestored = engine.onContextRestoredObservable.add(() => { lost = false; void warm(); });
  return {
    warm,
    sceneReady: sync,
    dispose(): void {
      if (disposed) return;
      disposed = true; generation++; sync();
      engine.onContextLostObservable.remove(contextLost);
      engine.onContextRestoredObservable.remove(contextRestored);
    },
  };
}
