import { skyStore, type createSkyStore } from './skyStore';
import { MAX_CONSTELLATIONS, STARS_PER_CONSTELLATION } from './constellationStore';
import { placeDoor } from './doorSelection';

type BabylonModule = typeof import('@/shared/babylon/babylonCore');
type SkyStore = ReturnType<typeof createSkyStore>;

const TRAIL_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec4 color;
uniform mat4 worldViewProjection;
uniform float trailStrength;
uniform float trailPixels;
uniform float streamOffset;
varying vec4 starColor;
void main(void) {
  vec4 clip = worldViewProjection * vec4(position, 1.0);
  if (streamOffset != 0.0 && clip.w > 0.0 && abs(clip.x / clip.w) <= 1.2) {
    clip.x = (mod(clip.x / clip.w + streamOffset + 1.2, 2.4) - 1.2) * clip.w;
  }
  gl_Position = clip;
  gl_PointSize = 2.5 + trailStrength * trailPixels;
  starColor = color;
}`;

const TRAIL_FRAGMENT = `
precision highp float;
uniform float trailStrength;
uniform float trailPixels;
uniform float starVisibility;
varying vec4 starColor;
void main(void) {
  float size = 2.5 + trailStrength * trailPixels;
  vec2 p = (gl_PointCoord - 0.5) * size;
  float across = 1.0 - smoothstep(0.3, 1.25, abs(p.y));
  float along = 1.0 - smoothstep(size * 0.3, size * 0.5, abs(p.x));
  float shape = mix(1.0, across * along, min(1.0, trailStrength * 4.0));
  gl_FragColor = vec4(starColor.rgb, starColor.a * shape * starVisibility);
}`;

/** Replace the existing point material; trails cost no additional geometry or draw call. */
function trailMaterial(B: BabylonModule, scene: InstanceType<BabylonModule['Scene']>) {
  const material = new B.ShaderMaterial('gameStarTrails', scene,
    { vertexSource: TRAIL_VERTEX, fragmentSource: TRAIL_FRAGMENT }, {
      attributes: ['position', 'color'],
      uniforms: ['worldViewProjection', 'trailStrength', 'trailPixels', 'streamOffset', 'starVisibility'],
      needAlphaBlending: true,
    });
  material.pointsCloud = true;
  material.alphaMode = B.Constants.ALPHA_ADD;
  material.backFaceCulling = false;
  material.setFloat('trailStrength', 0);
  material.setFloat('trailPixels', 21.5);
  material.setFloat('streamOffset', 0);
  material.setFloat('starVisibility', 1);
  return material;
}

/** Exactly two pooled meshes: every game's points, and every game's line segments. */
export function createConstellationMeshes(B: BabylonModule, scene: InstanceType<BabylonModule['Scene']>) {
  const pointCapacity = MAX_CONSTELLATIONS * STARS_PER_CONSTELLATION;
  const lineCapacity = MAX_CONSTELLATIONS * (STARS_PER_CONSTELLATION - 1) * 2;
  const positions = new Float32Array(pointCapacity * 3);
  const colors = new Float32Array(pointCapacity * 4);
  const linePositions = new Float32Array(lineCapacity * 3);
  const lineColors = new Float32Array(lineCapacity * 4);

  function mesh(name: string, coordinates: Float32Array, rgba: Float32Array, points: boolean) {
    const result = new B.Mesh(name, scene);
    result.setVerticesData('position', coordinates, true);
    result.setVerticesData('color', rgba, true);
    result.setIndices(Array.from({ length: coordinates.length / 3 }, (_, i) => i));
    // Changing the draw range makes the submesh non-global. Reuse its mesh bounds
    // so Babylon's transparent sorter still has a sphere without rebuilding bounds.
    result.subMeshes[0]!.setBoundingInfo(result.getBoundingInfo());
    const material = new B.StandardMaterial(`${name}Material`, scene);
    material.disableLighting = true;
    material.emissiveColor.set(1, 1, 1);
    material.diffuseColor.set(0, 0, 0);
    material.specularColor.set(0, 0, 0);
    material.alphaMode = B.Constants.ALPHA_ADD;
    material.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
    material.fillMode = points ? B.Material.PointFillMode : B.Material.LineListDrawMode;
    material.pointSize = 4.5;
    result.material = material;
    result.hasVertexAlpha = true;
    result.isPickable = false;
    result.alwaysSelectAsActiveMesh = true;
    result.setEnabled(false);
    return result;
  }

  const points = mesh('gameConstellationPoints', positions, colors, true);
  const lines = mesh('gameConstellationLines', linePositions, lineColors, false);

  function upload(store: SkyStore): void {
    colors.fill(0);
    lineColors.fill(0);
    const groups = store.constellations.groups;
    let line = 0;
    let point = 0;
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]!;
      let previous = -1;
      for (let j = 0; j < group.stars.length; j++) {
        const star = group.stars[j]!;
        if (!star.active) continue;
        const vertex = point++;
        positions[vertex * 3] = star.x; positions[vertex * 3 + 1] = star.y; positions[vertex * 3 + 2] = star.z;
        colors[vertex * 4] = group.accent.r; colors[vertex * 4 + 1] = group.accent.g;
        colors[vertex * 4 + 2] = group.accent.b; colors[vertex * 4 + 3] = star.alpha;
        if (previous >= 0) {
          for (let endpoint = 0; endpoint < 2; endpoint++) {
            const from = endpoint === 0 ? previous : vertex;
            linePositions[line * 3] = positions[from * 3]!;
            linePositions[line * 3 + 1] = positions[from * 3 + 1]!;
            linePositions[line * 3 + 2] = positions[from * 3 + 2]!;
            lineColors[line * 4] = group.accent.r;
            lineColors[line * 4 + 1] = group.accent.g;
            lineColors[line * 4 + 2] = group.accent.b;
            lineColors[line * 4 + 3] = Math.min(colors[previous * 4 + 3]!, star.alpha) * 0.14;
            line++;
          }
        }
        previous = vertex;
      }
    }
    // Buffers keep their capacity, but the GPU visits only occupied slots (half the phone cap).
    points.subMeshes[0]!.verticesCount = point;
    points.subMeshes[0]!.indexCount = point;
    lines.subMeshes[0]!.verticesCount = line;
    lines.subMeshes[0]!.indexCount = line;
    points.setEnabled(point > 0);
    lines.setEnabled(line > 0);
    (points.material as InstanceType<BabylonModule['StandardMaterial']>).pointSize = store.phone ? 3.5 : 4.5;
    points.updateVerticesData('position', positions);
    points.updateVerticesData('color', colors);
    lines.updateVerticesData('position', linePositions);
    lines.updateVerticesData('color', lineColors);
  }
  return { points, lines, upload };
}

export function installGameSky(
  B: BabylonModule,
  scene: InstanceType<BabylonModule['Scene']>,
  stars: InstanceType<BabylonModule['Mesh']>,
  nebula: InstanceType<BabylonModule['Layer']>,
  deltaSeconds: () => number,
  store: SkyStore = skyStore,
): void {
  const material = trailMaterial(B, scene);
  const previous = stars.material;
  stars.material = material;
  previous?.dispose();
  const constellations = createConstellationMeshes(B, scene);
  const world = B.Matrix.Identity();
  const position = new B.Vector3();
  const projected = new B.Vector3();
  const viewport = scene.activeCamera!.viewport.toGlobal(window.innerWidth, window.innerHeight);
  let streamOffset = 0;
  let previousStrength = 0;
  let lastUpload = -Infinity;
  let uploadedRevision = -1;

  const resize = (): void => {
    viewport.width = window.innerWidth; viewport.height = window.innerHeight;
  };
  window.addEventListener('resize', resize);

  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const dt = deltaSeconds();
    store.advance(now, dt);
    const strength = store.trail.state.strength;
    // Trapezoidal integration keeps the stream distance consistent across frame rates.
    if (!store.reduced) streamOffset = (streamOffset + store.trail.state.direction * (previousStrength + strength) * 0.5 * dt * 0.7) % 2.4;
    previousStrength = strength;
    material.setFloat('trailStrength', strength);
    material.setFloat('trailPixels', store.phone ? 9.5 : 21.5);
    material.setFloat('streamOffset', streamOffset);
    material.setFloat('starVisibility', stars.visibility);
    nebula.color.r = store.tint.r; nebula.color.g = store.tint.g; nebula.color.b = store.tint.b;
    if (uploadedRevision !== store.constellations.revision
      || (store.constellations.count > 0 && !store.reduced && now - lastUpload >= 1000 / 30)) {
      constellations.upload(store);
      uploadedRevision = store.constellations.revision;
      lastUpload = now;
    }
  });

  scene.onAfterRenderObservable.add(() => {
    const candidates = store.projections;
    const transform = scene.getTransformMatrix();
    const m = transform.m;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      const group = candidate.constellation;
      candidate.visible = false;
      if (group.count === 0) continue;
      position.set(group.position.x, group.position.y, group.position.z);
      const w = position.x * m[3]! + position.y * m[7]! + position.z * m[11]! + m[15]!;
      if (w <= 0) continue;
      B.Vector3.ProjectToRef(position, world, transform, viewport, projected);
      candidate.visible = projected.z >= 0 && projected.z <= 1
        && placeDoor(candidate.rect, projected.x, projected.y, viewport.width, viewport.height, store.phone);
    }
    if (!store.ready) store.setReady(true);
    else store.publishFrame();
  });
  scene.onDisposeObservable.addOnce(() => {
    window.removeEventListener('resize', resize);
    store.setReady(false);
  });
}
