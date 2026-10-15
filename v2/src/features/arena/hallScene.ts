import { CARD_ASPECT, CARD_HEIGHT, frameRing, mixTheme, slotTransform, wrapSlot, type RGB } from './hallLayout';
import { STEEL_THEME } from './hallManifest';
import { CARD_FRAGMENT, CARD_VERTEX, SKY_FRAGMENT, SKY_VERTEX } from './hallShaders';
import { hallDrawn, type HallItem } from './hallState';
import { loadHallTextures, type HallTextureLoader } from './hallTextures';
import type { ArenaModule, BabylonModule, Mesh, Scene, ShaderMaterial } from './arenaTypes';

interface HallFrame { readonly offset: number; readonly fade: number; readonly dt: number; readonly time: number; readonly reduced: boolean }
const cameraEnd = { y: 2.8, z: 16.9, pitch: 0.065 };

/** Every object belongs to M2's supplied arena scene. No engine, camera, loop or post-process is created. */
export function createHallScene(B: BabylonModule, A: ArenaModule, scene: Scene, items: readonly HallItem[],
  phone: boolean, requestStatic: () => void, textureLoader?: HallTextureLoader) {
  B.Effect.ShadersStore.arenaHallCardVertexShader = CARD_VERTEX;
  B.Effect.ShadersStore.arenaHallCardFragmentShader = CARD_FRAGMENT;
  B.Effect.ShadersStore.arenaHallSkyVertexShader = SKY_VERTEX;
  B.Effect.ShadersStore.arenaHallSkyFragmentShader = SKY_FRAGMENT;
  const root = new B.TransformNode('arenaHall', scene);
  root.setEnabled(false);
  const resources = loadHallTextures(B, A, scene, items, requestStatic, textureLoader);
  const width = CARD_HEIGHT * CARD_ASPECT;
  const materials: ShaderMaterial[] = [], meshes: Mesh[] = [];

  function cardMaterial(name: string, reflect: boolean) {
    const material = new B.ShaderMaterial(name, scene, { vertex: 'arenaHallCard', fragment: 'arenaHallCard' }, {
      attributes: ['position', 'normal'], samplers: ['uCover'], needAlphaBlending: true,
      uniforms: ['world', 'viewProjection', 'cameraPosition', 'uSize', 'uTheme', 'uSecondary', 'uBright', 'uBlur', 'uAlpha', 'uReflect', 'uTime'],
    });
    material.setFloats('uSize', [width, CARD_HEIGHT]);
    material.setFloat('uReflect', Number(reflect));
    material.backFaceCulling = !reflect;
    material.disableDepthWrite = reflect;
    materials.push(material);
    return material;
  }
  const slabs = Array.from({ length: items.length * 2 }, (_, index) => {
    const slab = A.CreateBox(`hallSlab${index}`, { width, height: CARD_HEIGHT, depth: 0.06 }, scene);
    const reflection = B.MeshBuilder.CreatePlane(`hallReflection${index}`, { width, height: CARD_HEIGHT }, scene);
    const material = cardMaterial(`hallCard${index}`, false), mirror = cardMaterial(`hallMirror${index}`, true);
    slab.material = material; reflection.material = mirror;
    for (const mesh of [slab, reflection]) {
      mesh.parent = root; mesh.isPickable = false; mesh.isVisible = false; meshes.push(mesh);
    }
    return { slab, reflection, material, mirror, resource: resources.covers[index % items.length]! };
  });

  const sky = B.MeshBuilder.CreatePlane('hallSky', { size: 1 }, scene);
  sky.parent = root; sky.alphaIndex = -4; sky.isPickable = false;
  const skyMaterial = new B.ShaderMaterial('hallSkyMaterial', scene, { vertex: 'arenaHallSky', fragment: 'arenaHallSky' }, {
    attributes: ['position', 'uv'], uniforms: ['worldViewProjection', 'uTheme', 'uSecondary', 'uAspect', 'uTime', 'uFade'],
    samplers: ['uNebula'], needAlphaBlending: true,
  });
  skyMaterial.disableDepthWrite = true; skyMaterial.backFaceCulling = false; sky.material = skyMaterial;
  materials.push(skyMaterial); meshes.push(sky);
  const primaryColour = new B.Color3(), secondaryColour = new B.Color3();
  let primary: RGB = STEEL_THEME.primary, secondary: RGB = STEEL_THEME.secondary;
  let fromPrimary = primary, fromSecondary = secondary, toPrimary = primary, toSecondary = secondary;
  let chosen = -1, changedAt = 0, disposed = false, warmed = false;

  function framing(): void {
    const camera = scene.activeCamera;
    if (!camera) return;
    const engine = scene.getEngine(), w = engine.getRenderWidth(), h = engine.getRenderHeight();
    const frame = frameRing(w, h, 0.82, phone), tangent = Math.tan(0.82 / 2);
    const y = (0.5 - frame.screenY) * 2 * frame.distance * tangent - CARD_HEIGHT * 0.12 / 2;
    const { pitch } = cameraEnd;
    root.position.set(0, cameraEnd.y - frame.distance * Math.sin(pitch) + y * Math.cos(pitch),
      cameraEnd.z + frame.distance * Math.cos(pitch) + y * Math.sin(pitch));
    root.rotation.x = pitch;
    const skyHeight = 2 * (frame.distance + 30) * tangent * 1.12;
    sky.scaling.set(skyHeight * w / Math.max(1, h), skyHeight, 1);
    sky.position.set(0, -y, 30);
    skyMaterial.setFloat('uAspect', w / Math.max(1, h));
  }

  return {
    step({ offset, fade, time, reduced }: HallFrame) {
      if (disposed) return STEEL_THEME;
      root.setEnabled(fade > 0.001);
      if (fade <= 0.001) return { primary, secondary };
      framing();
      const selected = Math.min(items.length - 1, Math.max(0, Math.round(offset)));
      if (selected !== chosen) {
        chosen = selected; changedAt = time * 1000;
        fromPrimary = primary; fromSecondary = secondary;
        toPrimary = items[selected]!.cover.primary; toSecondary = items[selected]!.cover.secondary;
      }
      primary = mixTheme(fromPrimary, toPrimary, time * 1000 - changedAt, reduced);
      secondary = mixTheme(fromSecondary, toSecondary, time * 1000 - changedAt, reduced);
      primaryColour.set(...primary); secondaryColour.set(...secondary);
      for (const [index, card] of slabs.entries()) {
        const relative = wrapSlot(index - offset, slabs.length), pose = slotTransform(relative, phone);
        card.slab.isVisible = card.reflection.isVisible = pose.alpha * fade > 0.004;
        card.slab.position.set(pose.x, pose.y, pose.z);
        card.slab.rotation.y = pose.yaw;
        card.slab.scaling.setAll(pose.scale);
        card.slab.alphaIndex = 10 - Math.floor(Math.abs(relative) * 2);
        card.reflection.position.set(pose.x, -CARD_HEIGHT - pose.y - 0.06, pose.z);
        card.reflection.rotation.y = pose.yaw;
        card.reflection.scaling.set(pose.scale, -pose.scale, pose.scale);
        card.reflection.alphaIndex = 0;
        for (const material of [card.material, card.mirror]) {
          material.setTexture('uCover', card.resource.texture);
          material.setColor3('uTheme', primaryColour); material.setColor3('uSecondary', secondaryColour);
          material.setFloat('uBright', pose.brightness); material.setFloat('uBlur', pose.blur);
          material.setFloat('uAlpha', pose.alpha * fade); material.setFloat('uTime', reduced ? 0 : time);
        }
      }
      skyMaterial.setTexture('uNebula', resources.nebula.texture);
      skyMaterial.setColor3('uTheme', primaryColour); skyMaterial.setColor3('uSecondary', secondaryColour);
      skyMaterial.setFloat('uTime', reduced ? 0 : time); skyMaterial.setFloat('uFade', fade);
      const current = slabs[selected]!;
      hallDrawn.publish(current.resource.ready && !current.resource.failed && current.material.isReady(current.slab));
      // Installed after the existing loop starts. Compilation completion also refreshes a frozen frame.
      if (!warmed) {
        warmed = true;
        void Promise.all(meshes.map(mesh => mesh.material?.forceCompilationAsync(mesh).catch(() => null))).then(() => {
          if (!disposed) requestStatic();
        });
      }
      return { primary, secondary };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      hallDrawn.publish(false);
      meshes.forEach(mesh => mesh.dispose()); materials.forEach(material => material.dispose());
      root.dispose(); resources.dispose();
    },
  };
}
