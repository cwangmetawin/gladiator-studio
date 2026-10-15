import { ARENA_CENTER, ARENA_RADIUS, arenaStars, colosseumLines } from './colosseumGeometry';
import { FLOOR_FRAGMENT, FLOOR_VERTEX, STAR_FRAGMENT, STAR_VERTEX } from './arenaWorldShaders';
import type { ArenaModule, BabylonModule, Mesh, Scene, ShaderMaterial } from './arenaTypes';
import type { RGB } from './hallLayout';

type Camera = NonNullable<Scene['activeCamera']>;

function shader(B: BabylonModule, scene: Scene, name: string, vertexSource: string, fragmentSource: string,
  attributes: string[], uniforms: string[], additive: boolean): ShaderMaterial {
  const material = new B.ShaderMaterial(name, scene, { vertexSource, fragmentSource }, {
    attributes, uniforms, needAlphaBlending: true,
  });
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.alphaMode = additive ? B.Constants.ALPHA_ADD : B.Constants.ALPHA_COMBINE;
  return material;
}

export function createArenaWorld(B: BabylonModule, A: ArenaModule, scene: Scene, phone: boolean) {
  const outlines = colosseumLines(phone ? 40 : 64);
  const lines = outlines.map(line => line.points.map(p => new B.Vector3(...p)));
  const colors = outlines.map(line => line.points.map(([x, y, z]) => {
    const distance = Math.hypot(x, y - 3, z - 16);
    const fade = 0.04 + 0.96 * Math.min(1, Math.max(0, (distance - 13) / 20));
    return new B.Color4(0.38 * line.gain, 0.65 * line.gain, 0.82 * line.gain, line.alpha * fade);
  }));
  const colosseum = B.MeshBuilder.CreateLineSystem('arenaColosseum', { lines, colors, useVertexAlpha: true }, scene);
  colosseum.alphaIndex = 1;

  const stars = new B.Mesh('arenaStars', scene), starData = new B.VertexData();
  Object.assign(starData, arenaStars(phone ? 1200 : 2600));
  starData.applyToMesh(stars, false);
  const starMaterial = shader(B, scene, 'arenaStarMaterial', STAR_VERTEX, STAR_FRAGMENT, ['position', 'uv', 'uv2'],
    ['view', 'projection', 'uPixel', 'uTime', 'uFade'], true);
  stars.material = starMaterial;
  stars.alwaysSelectAsActiveMesh = true;
  stars.alphaIndex = -2;

  const floor = new B.Mesh('arenaFloor', scene), floorData = new B.VertexData();
  const radius = ARENA_RADIUS + 6, [cx, cy, cz] = ARENA_CENTER;
  floorData.positions = [cx - radius, cy, cz - radius, cx + radius, cy, cz - radius,
    cx + radius, cy, cz + radius, cx - radius, cy, cz + radius];
  floorData.indices = [0, 1, 2, 0, 2, 3];
  floorData.applyToMesh(floor, false);
  const floorMaterial = shader(B, scene, 'arenaFloorMaterial', FLOOR_VERTEX, FLOOR_FRAGMENT, ['position'],
    ['world', 'viewProjection', 'uCenter', 'uTime', 'uFade', 'uTheme'], false);
  floorMaterial.setVector3('uCenter', new B.Vector3(...ARENA_CENTER));
  const floorColour = new B.Color3(0.38, 0.65, 0.82);
  floor.material = floorMaterial;
  floor.alphaIndex = -1;

  // Once the mouth is close the new scene owns an opaque night sky. A desktop crossing pass can then render
  // into its own framebuffer without discarding the starfield that the transparent emblem scene normally overlays.
  const nightTexture = A.RawTexture.CreateRGBATexture(new Uint8Array([3, 7, 12, 255]), 1, 1, scene, false, false);
  const nightSky = new B.Layer('arenaNight', null, scene, true);
  nightSky.texture = nightTexture;
  nightSky.color.a = 0;
  const meshes: Mesh[] = [colosseum, stars, floor];
  meshes.forEach(mesh => { mesh.isPickable = false; mesh.isVisible = false; });

  return {
    meshes,
    update({ fade, night, time, camera, theme }: { readonly fade: number; readonly night: number; readonly time: number; readonly camera: Camera; readonly theme?: RGB }): void {
      meshes.forEach(mesh => { mesh.isVisible = fade > 0.001; });
      colosseum.alpha = fade;
      starMaterial.setFloat('uFade', fade);
      starMaterial.setFloat('uTime', time);
      starMaterial.setFloat('uPixel', 2 * Math.tan(camera.fov / 2) / Math.max(1, scene.getEngine().getRenderHeight()));
      floorMaterial.setFloat('uFade', fade);
      floorMaterial.setFloat('uTime', time);
      floorColour.set(...(theme ?? [0.38, 0.65, 0.82] as const));
      floorMaterial.setColor3('uTheme', floorColour);
      nightSky.color.a = night;
    },
    dispose(): void {
      meshes.forEach(mesh => mesh.dispose(false, true));
      nightSky.dispose();
      nightTexture.dispose();
    },
  };
}
