import { ARENA_CENTER, ARENA_RADIUS, arenaStars, colosseumLines } from './colosseumGeometry';
import { ARENA_LIGHTING } from './arenaLighting';
import { FLOOR_FRAGMENT, FLOOR_VERTEX, OUTLINE_FRAGMENT, OUTLINE_VERTEX, STAR_FRAGMENT, STAR_VERTEX } from './arenaWorldShaders';
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
  const colosseum = new B.Mesh('arenaColosseum', scene), outlineData = new B.VertexData();
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  for (const line of outlines) {
    const first = positions.length / 3;
    for (let i = 0; i < line.points.length; i++) {
      const point = line.points[i]!, before = line.points[Math.max(0, i - 1)]!, after = line.points[Math.min(line.points.length - 1, i + 1)]!;
      for (const side of [-1, 1]) {
        positions.push(...point); normals.push(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
        uvs.push(side, 0); colors.push(0.40 * line.gain, 0.68 * line.gain, 0.86 * line.gain, line.alpha);
      }
      if (i > 0) { const a = first + (i - 1) * 2; indices.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
  }
  const outlineMaterial = shader(B, scene, 'arenaOutlineMaterial', OUTLINE_VERTEX, OUTLINE_FRAGMENT,
    ['position', 'normal', 'uv', 'color'], ['worldView', 'projection', 'uPixel', 'uFade'], true);
  colosseum.material = outlineMaterial;
  Object.assign(outlineData, { positions, normals, uvs, colors, indices }); outlineData.applyToMesh(colosseum, false);
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
  const floorColour = new B.Color3(...ARENA_LIGHTING.theme);
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
      for (const mesh of meshes) mesh.isVisible = fade > 0.001;
      const pixel = 2 * Math.tan(camera.fov / 2) / Math.max(1, scene.getEngine().getRenderHeight());
      outlineMaterial.setFloat('uFade', fade);
      outlineMaterial.setFloat('uPixel', pixel);
      starMaterial.setFloat('uFade', fade);
      starMaterial.setFloat('uTime', time);
      starMaterial.setFloat('uPixel', pixel);
      floorMaterial.setFloat('uFade', fade);
      floorMaterial.setFloat('uTime', time);
      floorColour.set(...(theme ?? ARENA_LIGHTING.theme));
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
