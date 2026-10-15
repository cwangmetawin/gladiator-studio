import { createArenaWorld } from './arenaWorld';
import { createCameraTrack, helmetMouthY, type CameraFraming } from './cameraTrack';
import { createDiveFlash } from './diveFlash';
import { createHallLayer } from './hallLayer';
import { createCrossingSound } from './arenaSound';
import { cameraScreens, DIVE_SCREENS, journeyProgress, smoothScreens, smoothstep } from './journeyProgress';
import type { EmblemAsset } from './emblemFormat';
import type { Framing } from './framing';
import type { ArenaModule, BabylonModule, Scene } from './arenaTypes';

type Camera = InstanceType<ArenaModule['FreeCamera']>;

/** Lives inside M1's arena Scene. StarfieldBackground remains the only render-loop owner. */
export function createArenaDive(B: BabylonModule, A: ArenaModule, scene: Scene, camera: Camera, asset: EmblemAsset,
  phone: boolean, reducedMotion: () => boolean, requestStatic: () => void, onCrossing: (soft: boolean) => void = () => {}) {
  const world = createArenaWorld(B, A, scene, phone);
  const flash = createDiveFlash(B, scene, phone);
  const hall = createHallLayer(B, A, scene, phone, reducedMotion, requestStatic);
  const mouthY = helmetMouthY(asset.cap.positions);
  let displayed = journeyProgress.getSnapshot();
  const crossingSound = createCrossingSound(cameraScreens(displayed, reducedMotion()), onCrossing, reducedMotion());
  let frame: CameraFraming | null = null;
  let track: ReturnType<typeof createCameraTrack> | null = null;
  let disposed = false;
  let cut = cameraScreens(displayed, true);
  const unsubscribe = journeyProgress.subscribe(() => {
    const next = cameraScreens(journeyProgress.getSnapshot(), true), changed = next !== cut;
    cut = next;
    if (changed && reducedMotion()) requestStatic();
  });

  return {
    meshes: world.meshes,
    step(framing: Framing, fov: number, dt: number, visibility: number, time: number, home: boolean, sceneReady: boolean) {
      const reduced = reducedMotion(), target = cameraScreens(journeyProgress.getSnapshot(), reduced);
      displayed = reduced ? target : smoothScreens(displayed, target, dt);
      if (!frame || frame.distance !== framing.distance || frame.offsetX !== framing.offsetX || frame.offsetY !== framing.offsetY || frame.fov !== fov) {
        frame = { ...framing, fov, mouthY };
        track = createCameraTrack(frame);
      }
      const pose = track!(displayed);
      camera.position.set(pose.x, pose.y, pose.z);
      camera.rotation.set(pose.pitch, 0, 0);
      camera.fov = pose.fov;
      const p = displayed / DIVE_SCREENS;
      const fade = smoothstep(0.5, 0.8, p) * visibility;
      const night = smoothstep(0.38, 0.63, p) * visibility;
      const hallFade = reduced ? (target > 0 ? visibility : 0) : smoothstep(0.95, 1.6, displayed) * visibility;
      const theme = hall.step(hallFade, dt, time);
      world.update({ fade, night, time: reduced ? 0 : time, camera, theme: theme?.primary });
      const crossing = flash.update(displayed, reduced, home, night === 1, sceneReady);
      crossingSound.update({ screens: displayed, reduced, enabled: home && visibility > 0.5 && sceneReady, nowMs: performance.now() });
      return {
        screens: displayed,
        presence: 1 - smoothstep(0.08, 0.5, p),
        emblemVisible: pose.z < 1.2,
        flash: crossing,
      };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubscribe(); hall.dispose(); flash.dispose(); world.dispose();
    },
  };
}
