import { ARENA_RADIUS } from './colosseumGeometry';
import { createPageGates, type ArenaPageGate } from './pageGates';
import { SAIRA_TITLE_ADVANCE, SAIRA_TITLE_GLYPHS } from './sairaGateGlyphs';
import type { ArenaModule, BabylonModule, Scene } from './arenaTypes';

type Point = readonly [number, number, number];
type Colour = readonly [number, number, number];
interface GateGeometry { positions: number[]; normals: number[]; colors: number[]; indices: number[] }
const FRONT: Colour = [0.28, 0.39, 0.46], REVEAL: Colour = [0.07, 0.13, 0.19];
const EDGE: Colour = [1.25, 1.72, 1.94], SIGN: Colour = [0.022, 0.049, 0.073], LETTER: Colour = [1.44, 1.62, 1.72];

/** A hollow, lit portal below the ground-tier cornice. Saira outlines are baked: no runtime font or texture work. */
export function pageGateGeometry(gate: ArenaPageGate, phone: boolean): GateGeometry {
  const result: GateGeometry = { positions: [], normals: [], colors: [], indices: [] };
  const [nx, , nz] = gate.outward, tx = -nz, tz = nx;
  const aperture = ARENA_RADIUS * Math.sin(gate.halfAngle) - 0.18;
  const half = Math.max(1.7, aperture + 0.58), inset = half - aperture;
  const front = -0.72, back = 1.9, spring = gate.floorY + 2.96, rise = 0.77;
  const world = ([x, y, z]: Point): Point => [gate.center[0] + tx * x + nx * z, y, gate.center[2] + tz * x + nz * z];
  function quad(a: Point, b: Point, c: Point, d: Point, colour: Colour): void {
    const first = result.positions.length / 3, points = [world(a), world(b), world(c), world(d)];
    const [p, q, r] = points as [Point, Point, Point, Point];
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const normal: Point = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(...normal) || 1;
    for (const point of points) {
      result.positions.push(...point); result.normals.push(normal[0] / length, normal[1] / length, normal[2] / length);
      result.colors.push(...colour, 1);
    }
    result.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, colour: Colour): void {
    quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], colour);
    quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], colour);
    quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], REVEAL);
    quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], REVEAL);
    quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], colour);
  }
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -half : half - inset, x1 = side < 0 ? -half + inset : half;
    box(x0, x1, gate.floorY, spring, front, back, FRONT);
    box(x0 - 0.1, x1 + 0.1, gate.floorY, gate.floorY + 0.22, front - 0.08, back + 0.08, FRONT);
    box(x0 - 0.04, x1 + 0.04, gate.floorY + 0.22, gate.floorY + 0.27, front - 0.08, back + 0.04, EDGE);
    box(x0 - 0.05, x1 + 0.05, spring - 0.12, spring + 0.04, front - 0.08, back + 0.04, EDGE);
    // Inner light blades continue through the reveal: the two lit pillars sweep past the camera.
    const edge = side * (aperture + 0.035), outer = edge + side * 0.06;
    quad([edge, gate.floorY + 0.27, front - 0.012], [outer, gate.floorY + 0.27, front - 0.012],
      [outer, spring - 0.12, front - 0.012], [edge, spring - 0.12, front - 0.012], EDGE);
    quad([edge, gate.floorY + 0.27, back + 0.012], [outer, gate.floorY + 0.27, back + 0.012],
      [outer, spring - 0.12, back + 0.012], [edge, spring - 0.12, back + 0.012], EDGE);
    box(x0 + 0.15, x1 - 0.15, gate.floorY + 0.3, spring - 0.2, front - 0.025, front, REVEAL);
  }
  const segments = phone ? 10 : 18;
  const arch = (angle: number, inner: boolean, z: number): Point =>
    [(half - (inner ? inset : 0)) * Math.cos(angle), spring + (inner ? 0.54 : rise) * Math.sin(angle), z];
  const trim = (angle: number, z: number): Point => [(aperture + 0.055) * Math.cos(angle), spring + 0.595 * Math.sin(angle), z];
  for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI, b = (i + 1) / segments * Math.PI;
    quad(arch(a, false, front), arch(b, false, front), arch(b, true, front), arch(a, true, front), FRONT);
    quad(arch(a, true, front), arch(b, true, front), arch(b, true, back), arch(a, true, back), REVEAL);
    quad(arch(b, false, front), arch(a, false, front), arch(a, false, back), arch(b, false, back), FRONT);
    quad(arch(a, true, back), arch(b, true, back), arch(b, false, back), arch(a, false, back), FRONT);
    quad(arch(a, true, front - 0.012), arch(b, true, front - 0.012),
      arch(b, true, front + 0.06), arch(a, true, front + 0.06), EDGE);
    quad(arch(a, true, back - 0.06), arch(b, true, back - 0.06),
      arch(b, true, back + 0.012), arch(a, true, back + 0.012), EDGE);
    quad(trim(a, front - 0.018), trim(b, front - 0.018), arch(b, true, front - 0.018), arch(a, true, front - 0.018), EDGE);
    quad(trim(b, back + 0.018), trim(a, back + 0.018), arch(a, true, back + 0.018), arch(b, true, back + 0.018), EDGE);
  }
  box(-half, half, gate.floorY, gate.floorY + 0.045, front, back, REVEAL);
  // Large real Saira capitals sit above the arch; the long Client Area title gets a wider entablature.
  const name = gate.label.toUpperCase(), cap = 0.45, tracking = 0.035;
  const width = [...name].reduce((sum, char) => sum + (SAIRA_TITLE_ADVANCE[char] ?? 0) * cap + tracking, -tracking);
  const signHalf = Math.max(half + 0.08, width / 2 + 0.16), baseline = gate.floorY + 3.765;
  box(-signHalf, signHalf, gate.floorY + 3.74, gate.floorY + 4.24, front - 0.05, back + 0.05, SIGN);
  box(-signHalf - 0.03, signHalf + 0.03, gate.floorY + 3.69, gate.floorY + 3.74, front - 0.07, back + 0.07, EDGE);
  let left = -width / 2;
  for (let letter = 0; letter < name.length; letter++) {
    const char = name[letter]!, strips = SAIRA_TITLE_GLYPHS[char];
    if (strips) for (let i = 0; i < strips.length; i += 6) {
      const x0 = left + strips[i]! * cap, x1 = left + strips[i + 1]! * cap;
      const x2 = left + strips[i + 2]! * cap, x3 = left + strips[i + 3]! * cap;
      const y0 = baseline + strips[i + 4]! * cap, y1 = baseline + strips[i + 5]! * cap;
      quad([-x1, y0, front - 0.056], [-x0, y0, front - 0.056],
        [-x2, y1, front - 0.056], [-x3, y1, front - 0.056], LETTER);
      quad([x0, y0, back + 0.056], [x1, y0, back + 0.056],
        [x3, y1, back + 0.056], [x2, y1, back + 0.056], LETTER);
    }
    left += (SAIRA_TITLE_ADVANCE[char] ?? 0) * cap + tracking;
  }
  return result;
}

/** Installed and compiled with the arena's warm set; update changes only existing mesh uniforms. */
export function createPageGateMeshes(B: BabylonModule, _A: ArenaModule, scene: Scene, phone: boolean) {
  const material = new B.StandardMaterial('arenaPageGateSteel', scene);
  material.disableLighting = true; material.emissiveColor.set(1, 1, 1); material.backFaceCulling = false;
  material.transparencyMode = B.Material.MATERIAL_ALPHABLEND; material.forceDepthWrite = true;
  const meshes = createPageGates(phone ? 40 : 64).map(gate => {
    const mesh = new B.Mesh(`arenaPageGate-${gate.id}`, scene), data = new B.VertexData();
    Object.assign(data, pageGateGeometry(gate, phone)); data.applyToMesh(mesh, false);
    mesh.material = material; mesh.isPickable = false; mesh.isVisible = false;
    mesh.alphaIndex = 2; mesh.useVertexColors = true; mesh.hasVertexAlpha = false;
    return mesh;
  });
  let disposed = false;
  return {
    meshes,
    update(fade: number, _activeGate?: string): void {
      if (disposed) return;
      const visible = Math.min(1, Math.max(0, fade));
      for (const mesh of meshes) { mesh.isVisible = visible > 0.001; mesh.visibility = visible; }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const mesh of meshes) mesh.dispose();
      material.dispose();
    },
  };
}
