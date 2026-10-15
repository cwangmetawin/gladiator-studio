import { hallOffset, followHall } from './hallProgress';
import { journeyProgress } from './journeyProgress';
import { hallContent } from './hallState';
import { createHallScene } from './hallScene';
import type { HallTextureLoader } from './hallTextures';
import type { ArenaModule, BabylonModule, Scene } from './arenaTypes';

/** Lazy resources within the existing render owner. React may publish catalogue data on the hero;
 * neither covers nor the nebula are requested until the camera reaches the arena. */
export function createHallLayer(B: BabylonModule, A: ArenaModule, scene: Scene, phone: boolean,
  reducedMotion: () => boolean, requestStatic: () => void, textureLoader?: HallTextureLoader) {
  let hall: ReturnType<typeof createHallScene> | null = null;
  let content = hallContent.getSnapshot(), installed = content;
  let offset = 0, disposed = false, still = -1;
  const unsubscribeData = hallContent.subscribe(() => {
    content = hallContent.getSnapshot();
    if (reducedMotion() && journeyProgress.getSnapshot() >= 1) requestStatic();
  });
  const unsubscribeScroll = journeyProgress.subscribe(() => {
    const next = Math.round(hallOffset(journeyProgress.getSnapshot(), content.length));
    if (next === still) return;
    still = next;
    if (reducedMotion() && journeyProgress.getSnapshot() >= 1) requestStatic();
  });
  return {
    step(fade: number, dt: number, time: number) {
      if (disposed) return undefined;
      const reduced = reducedMotion(), screens = journeyProgress.getSnapshot();
      if (screens >= (reduced ? 1 : 1.05) && content !== installed) { hall?.dispose(); hall = null; installed = content; }
      if (!hall && content.length && screens >= (reduced ? 1 : 1.05)) {
        hall = createHallScene(B, A, scene, content, phone || content[0]?.compact === true, requestStatic, textureLoader);
        installed = content;
      }
      offset = followHall(offset, hallOffset(screens, content.length, reduced), dt, reduced);
      return hall?.step({ offset, fade, dt, time, reduced });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubscribeData(); unsubscribeScroll(); hall?.dispose(); hall = null;
    },
  };
}
