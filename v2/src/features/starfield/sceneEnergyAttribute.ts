// Like useGameSky's TRAIL_VALUES, allocate strings once, never during a render.
export const SCENE_ENERGY_VALUES = Object.freeze(Array.from({ length: 101 }, (_, i) => (i / 100).toFixed(2)));

/** The reader must decode an actual material parameter, not the input store. */
export function mirrorSceneEnergy(root: HTMLElement | null, readMaterialEnergy: () => number): void {
  if (!root) return;
  const value = SCENE_ENERGY_VALUES[Math.max(0, Math.min(100, Math.round(readMaterialEnergy() * 100)))]!;
  if (root.dataset.sceneEnergy !== value) root.dataset.sceneEnergy = value;
}
