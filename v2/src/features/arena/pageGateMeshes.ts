import { ARENA_RADIUS } from './colosseumGeometry';
import { createPageGates, type ArenaPageGate } from './pageGates';
import type { ArenaModule, BabylonModule, Scene } from './arenaTypes';

type Point = readonly [number, number, number];
type Colour = readonly [number, number, number];
interface GateGeometry { positions: number[]; normals: number[]; colors: number[]; indices: number[] }
const FRONT: Colour = [0.31, 0.46, 0.57], REVEAL: Colour = [0.055, 0.11, 0.17];
const EDGE: Colour = [0.58, 0.79, 0.9], SIGN: Colour = [0.019, 0.039, 0.061];
const LETTERS: Readonly<Record<string, string>> = {
  A: '01110/10001/10001/11111/10001/10001/10001', B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01111/10000/10000/10000/10000/10000/01111', E: '11111/10000/10000/11110/10000/10000/11111',
  G: '01111/10000/10000/10111/10001/10001/01110', I: '11111/00100/00100/00100/00100/00100/11111',
  J: '00111/00010/00010/00010/00010/10010/01100', L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001', N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110', R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110', T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110', V: '10001/10001/10001/10001/10001/01010/00100',
  Y: '10001/10001/01010/00100/00100/00100/00100',
};

/** A hollow, extruded ground-tier arch. All signs are baked quads, so flights need no texture or font work. */
export function pageGateGeometry(gate: ArenaPageGate, phone: boolean): GateGeometry {
  const result: GateGeometry = { positions: [], normals: [], colors: [], indices: [] };
  const [nx, , nz] = gate.outward, tx = -nz, tz = nx;
  const half = ARENA_RADIUS * Math.sin(gate.halfAngle), inset = 0.18;
  const front = -0.56, back = 1.66, spring = gate.springY, rise = gate.crownY - spring;
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
    box(x0, x1, gate.floorY, gate.floorY + 0.18, front - 0.07, back, EDGE);
    box(x0, x1, spring - 0.1, spring + 0.08, front - 0.07, back, EDGE);
    const edge = side * (half - inset + 0.025);
    quad([edge, gate.floorY + 0.18, front - 0.012], [edge + 0.035, gate.floorY + 0.18, front - 0.012],
      [edge + 0.035, spring - 0.1, front - 0.012], [edge, spring - 0.1, front - 0.012], EDGE);
  }
  const segments = phone ? 10 : 18;
  const arch = (angle: number, inner: boolean, z: number): Point =>
    [(half - (inner ? inset : 0)) * Math.cos(angle), spring + (rise - (inner ? inset : 0)) * Math.sin(angle), z];
  for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI, b = (i + 1) / segments * Math.PI;
    quad(arch(a, false, front), arch(b, false, front), arch(b, true, front), arch(a, true, front), FRONT);
    quad(arch(a, true, front), arch(b, true, front), arch(b, true, back), arch(a, true, back), REVEAL);
    quad(arch(b, false, front), arch(a, false, front), arch(a, false, back), arch(b, false, back), FRONT);
    quad(arch(a, true, back), arch(b, true, back), arch(b, false, back), arch(a, false, back), FRONT);
    quad(arch(a, true, front - 0.012), arch(b, true, front - 0.012),
      arch(b, true, front + 0.035), arch(a, true, front + 0.035), EDGE);
  }
  box(-half, half, gate.floorY, gate.floorY + 0.045, front, back, REVEAL);
  // Nameplates sit between the ground-tier crown and its cornice, readable from inside and outside.
  box(-0.11, 0.11, gate.crownY - 0.025, Math.max(gate.crownY + 0.04, gate.floorY + 3.84), front - 0.035, front + 0.08, FRONT);
  box(-half, half, gate.floorY + 3.82, gate.floorY + 4.24, front - 0.025, front + 0.02, SIGN);
  const name = gate.label.toUpperCase(), cell = Math.min(0.043, (half * 2 - 0.16) / (name.length * 6 - 1));
  const left = -(name.length * 6 - 1) * cell / 2, top = gate.floorY + 4.03 + 3.5 * cell;
  for (let letter = 0; letter < name.length; letter++) {
    const rows = LETTERS[name[letter]!]?.split('/');
    if (!rows) continue;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
      if (rows[y]![x] !== '1') continue;
      const x0 = left + (letter * 6 + x) * cell, y0 = top - y * cell;
      quad([-x0 - cell, y0 - cell, front - 0.03], [-x0, y0 - cell, front - 0.03],
        [-x0, y0, front - 0.03], [-x0 - cell, y0, front - 0.03], EDGE);
      quad([x0, y0 - cell, front + 0.025], [x0 + cell, y0 - cell, front + 0.025],
        [x0 + cell, y0, front + 0.025], [x0, y0, front + 0.025], EDGE);
    }
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
