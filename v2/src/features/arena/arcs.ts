import { createArcMaterial } from './ribbonShaders';
import { ARC_FLASH_MS } from './arcSchedule';
import type { BabylonModule, Mesh, PointLight, Scene, ShaderMaterial, TransformNode } from './arenaTypes';
import type { ArcEdge, PlacementConstants } from './emblemFormat';

// The electric arcs: one jagged, branching ribbon that races along a wing's top edge for ARC_FLASH_MS,
// re-jittered every 45 ms, with a point light that flickers with it. Three small dynamic meshes (a main
// bolt and two forks) are reused by every arc, so nothing is allocated while the emblem idles.

const MAIN_POINTS = 33, BRANCH_POINTS = 17;
/** The arc floats just in front of the metal (negative z is towards the camera). */
const ARC_Z = -0.016;
const JITTER_MS = 45;

function placeWing(p: PlacementConstants, side: number) {
  if (!side) return (x: number, y: number, z: number): [number, number, number] => [x, y, z + p.helmetForward];
  const rad = (p.sweepDeg * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad) * side, pivot = p.pivotX * side;
  return (x: number, y: number, z: number): [number, number, number] => { const dx = x - pivot; return [pivot + dx * c - z * s, y, dx * s + z * c]; };
}

/** Midpoint displacement: a jagged offset for n points, with amplitude shrinking at each level. */
function displace(n: number, amplitude: number, random: () => number, out: Float32Array): Float32Array {
  out.fill(0);
  const last = n - 1;
  let amp = amplitude;
  for (let size = last; size > 1; size = Math.floor(size / 2)) {
    for (let i = 0; i + size <= last; i += size) {
      const mid = i + Math.floor(size / 2);
      out[mid] = (out[i]! + out[i + size]!) / 2 + (random() * 2 - 1) * amp;
    }
    amp *= 0.56;
  }
  return out;
}

interface Part { readonly mesh: Mesh; readonly material: ShaderMaterial; readonly buffer: Float32Array }

function createPart(B: BabylonModule, scene: Scene, name: string, points: number, parent: TransformNode): Part {
  const mesh = new B.Mesh(name, scene);
  const uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i < points; i++) {
    uvs.push(i / (points - 1), 0, i / (points - 1), 1);
    if (i < points - 1) { const a = i * 2; indices.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  const vertexData = new B.VertexData();
  vertexData.positions = new Array<number>(points * 6).fill(0);
  vertexData.uvs = uvs;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, true);
  const material = createArcMaterial(B, scene, `${name}Material`);
  mesh.material = material;
  mesh.parent = parent;
  mesh.alphaIndex = 4;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isPickable = false;
  mesh.isVisible = false;
  return { mesh, material, buffer: new Float32Array(points * 6) };
}

export interface Arcs {
  /** Start the arc of this feather (index into the baked arc list) at time nowMs. */
  fire(feather: number, nowMs: number): void;
  /** Advance the running arc; `fade` (0..1) scales its brightness with the emblem's visibility. */
  update(nowMs: number, fade: number): void;
  isActive(): boolean;
  /** The meshes' materials, for background shader compilation. */
  readonly parts: readonly { readonly mesh: Mesh }[];
  dispose(): void;
}

export function createArcs(B: BabylonModule, scene: Scene, edges: readonly ArcEdge[], placement: PlacementConstants,
  parent: TransformNode, light: PointLight, random: () => number): Arcs {
  const parts = [createPart(B, scene, 'arcMain', MAIN_POINTS, parent), createPart(B, scene, 'arcBranchA', BRANCH_POINTS, parent), createPart(B, scene, 'arcBranchB', BRANCH_POINTS, parent)];
  const placers = edges.map(edge => placeWing(placement, edge.side));
  const scratch = { main: new Float32Array(MAIN_POINTS), branch: new Float32Array(BRANCH_POINTS) };
  let active: { feather: number; startMs: number; t0: number; t1: number; tick: number; branchAt: readonly [number, number] } | null = null;

  function ribbon(points: number[][], width: number, place: (x: number, y: number, z: number) => [number, number, number], part: Part): void {
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(0, i - 1)]!, b = points[Math.min(n - 1, i + 1)]!;
      let tx = b[0]! - a[0]!, ty = b[1]! - a[1]!;
      const length = Math.hypot(tx, ty) || 1;
      tx /= length; ty /= length;
      const w = width * (0.55 + 0.45 * Math.sin((Math.PI * i) / (n - 1)));
      const p0 = place(points[i]![0]! - ty * w, points[i]![1]! + tx * w, ARC_Z), p1 = place(points[i]![0]! + ty * w, points[i]![1]! - tx * w, ARC_Z);
      part.buffer.set(p0, i * 6); part.buffer.set(p1, i * 6 + 3);
    }
    part.mesh.updateVerticesData('position', part.buffer);
  }

  /** The edge's point at fraction t (0 = helmet end, 1 = wing tip), with its outward normal. */
  function sample(points: Float32Array, t: number): { p: [number, number]; n: [number, number] } {
    const count = points.length / 4, x = t * (count - 1), i = Math.min(count - 2, Math.floor(x)), f = x - i;
    const a = i * 4, b = (i + 1) * 4;
    return { p: [points[a]! + (points[b]! - points[a]!) * f, points[a + 1]! + (points[b + 1]! - points[a + 1]!) * f], n: [points[a + 2]!, points[a + 3]!] };
  }

  function rebuild(): void {
    if (!active) return;
    const edge = edges[active.feather]!, place = placers[active.feather]!;
    const base = Array.from({ length: MAIN_POINTS }, (_, i) => sample(edge.points, active!.t0 + ((active!.t1 - active!.t0) * i) / (MAIN_POINTS - 1)));
    const d = displace(MAIN_POINTS, 0.05, random, scratch.main);
    const main = base.map((s, i) => [s.p[0] + s.n[0] * (0.012 + d[i]!), s.p[1] + s.n[1] * (0.012 + d[i]!)]);
    ribbon(main, 0.02, place, parts[0]!);
    active.branchAt.forEach((at, k) => {
      // A fork leaves the channel forward, 30-65 degrees off it, mostly away from the metal.
      const from = main[at]!, s = base[at]!, a = main[at - 1]!, b = main[at + 1]!;
      const tl = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) || 1, tx = (b[0]! - a[0]!) / tl, ty = (b[1]! - a[1]!) / tl;
      const angle = 0.52 + random() * 0.6, away = random() < 0.8 ? 1 : -1, length = 0.14 + random() * 0.22;
      const dx = tx * Math.cos(angle) + s.n[0] * Math.sin(angle) * away, dy = ty * Math.cos(angle) + s.n[1] * Math.sin(angle) * away;
      const jag = displace(BRANCH_POINTS, 0.04, random, scratch.branch);
      const points = Array.from({ length: BRANCH_POINTS }, (_, i) => {
        const t = i / (BRANCH_POINTS - 1);
        return [from[0]! + dx * length * t - dy * jag[i]!, from[1]! + dy * length * t + dx * jag[i]!];
      });
      ribbon(points, 0.009, place, parts[k + 1]!);
    });
    const mid = main[Math.floor(MAIN_POINTS / 2)]!, lp = place(mid[0]!, mid[1]!, -0.32);
    light.position.set(lp[0], lp[1], lp[2]);
  }

  function stop(): void {
    active = null;
    parts.forEach(part => { part.mesh.isVisible = false; });
    light.intensity = 0;
  }

  return {
    fire(feather, nowMs) {
      if (active || !edges[feather]) return;
      const t0 = 0.02 + random() * 0.22;
      active = { feather, startMs: nowMs, t0, t1: Math.min(0.98, t0 + 0.42 + random() * 0.3), tick: -1,
        branchAt: [8 + Math.floor(random() * 8), 18 + Math.floor(random() * 8)] };
    },
    update(nowMs, fade) {
      if (!active) return;
      const age = (nowMs - active.startMs) / 1000, duration = ARC_FLASH_MS / 1000;
      if (age > duration || fade <= 0.001) { stop(); return; }
      const tick = Math.floor((age * 1000) / JITTER_MS);
      if (tick !== active.tick) { active.tick = tick; rebuild(); }
      const flicker = 0.62 + 0.38 * (tick % 2 ? 1 : 0.55 + 0.45 * random());
      const on = Math.min(1, age / 0.035), off = 1 - Math.max(0, Math.min(1, (age - duration * 0.55) / (duration * 0.45)));
      const e = on * off * flicker * fade;
      parts.forEach((part, k) => {
        part.mesh.isVisible = true;
        part.material.setFloat('uIntensity', e * (k ? 5 : 11));
        part.material.setFloat('uGrow', Math.min(1, age / 0.06) * 1.05);
      });
      light.intensity = e * 1.6;
    },
    isActive: () => active !== null,
    parts,
    dispose() { parts.forEach(part => { part.mesh.dispose(false, true); }); },
  };
}
