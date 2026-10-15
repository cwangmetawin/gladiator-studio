// The 3D emblem's geometry, cut from the brand logo's rings at build time (bake-emblem.mjs): a
// bevelled extrusion per piece (front cap, 45 degree bevel, side wall), two glow ribbons along the
// outlines, and the top-edge paths the electric arcs race along. Plain arrays, no dependencies.
// The runtime never triangulates, offsets or places anything: it uploads what this file made.
//
// World units: 1 logo unit = 0.01. +x right, +y up, the camera looks along +z from z < 0, so the
// emblem's front face is at z = 0 and its depth runs towards +z. Babylon's front face is the side
// that (A-B)x(C-B) points to, and every triangle is ordered to face its intended normal.

export const SCALE = 0.01;
/** Wings hinge at the helmet's edge and sweep back; the helmet stands slightly in front of them. */
export const PLACEMENT = Object.freeze({ pivotX: 0.95, sweepDeg: 10, helmetForward: -0.07 });
/** Extrusion depth and bevel width in logo units, per piece kind. */
export const PIECE = Object.freeze({ helmet: { depth: 36, bevel: 3.0 }, wing: { depth: 24, bevel: 2.4 } });
export const SHARP_DEG = 38;
export const RIBBON = Object.freeze({ maxSeg: 0.05, maxDelayDist: 4.2, origin: [0, 0.2], wIn: 0.02, wOut: 0.11, haloZ: 0.7, currentWidth: 0.009, currentZ: -0.004 });
export const ARC_EDGE = Object.freeze({ resample: 0.04, upwardMinNy: 0.55 });

const hypot = Math.hypot;

export function signedArea(ring) {
  let area = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    area += p[0] * q[1] - q[0] * p[1];
  }
  return area / 2;
}

/** The ring wound counter-clockwise (y up), which makes the edge normal (dy, -dx) point outwards. */
export function counterClockwise(ring) {
  return signedArea(ring) > 0 ? ring : ring.slice().reverse();
}

export function resampleRing(ring, maxSeg) {
  const out = [];
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    const steps = Math.max(1, Math.ceil(hypot(q[0] - p[0], q[1] - p[1]) / maxSeg));
    for (let j = 0; j < steps; j++) out.push([p[0] + (q[0] - p[0]) * j / steps, p[1] + (q[1] - p[1]) * j / steps]);
  }
  return out;
}

/** Per-vertex frame of a counter-clockwise ring: outward edge normals, mitred vertex normals
 *  (with the mitre's length scale), sharp-corner flags and arc length. */
export function ringFrame(points, sharpDeg = SHARP_DEG) {
  const n = points.length;
  const edgeN = new Array(n), vertexN = new Array(n), sharp = new Uint8Array(n), s = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const p = points[i], q = points[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1], length = hypot(dx, dy) || 1e-9;
    edgeN[i] = [dy / length, -dx / length];
    s[i + 1] = s[i] + length;
  }
  const cosLimit = Math.cos(sharpDeg * Math.PI / 180);
  for (let i = 0; i < n; i++) {
    const a = edgeN[(i - 1 + n) % n], b = edgeN[i];
    let mx = a[0] + b[0], my = a[1] + b[1];
    const length = hypot(mx, my);
    if (length < 1e-6) { mx = b[0]; my = b[1]; } else { mx /= length; my /= length; }
    sharp[i] = a[0] * b[0] + a[1] * b[1] < cosLimit ? 1 : 0;
    vertexN[i] = [mx, my, 1 / Math.max(0.3, mx * b[0] + my * b[1])];
  }
  return { points, n, edgeN, vertexN, sharp, s, total: s[n] };
}

function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
  return hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * The ring pulled inwards by `width` along its mitred vertex normals (the cap's outline), vertex for
 * vertex, so the bevel strip can join each outer vertex to its inset. Where an edge is shorter than the
 * bevel is wide, moving both ends by the full amount would turn that edge inside out; those vertices
 * move less (the bevel narrows there) until every edge keeps at least a fifth of its length.
 */
export function insetRing(frame, width) {
  const n = frame.n, pts = frame.points;
  // A vertex also stays clear of the rest of the outline: thin tips and slivers get a narrower bevel
  // instead of folding over their other side.
  const clearance = pts.map((p, i) => {
    let nearest = Infinity;
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      if (j === i || k === i) continue;
      nearest = Math.min(nearest, distanceToSegment(p, pts[j], pts[k]));
    }
    return nearest;
  });
  const k = frame.vertexN.map((m, i) => Math.min(Math.min(m[2], 2.5) * width, 0.4 * clearance[i]));
  const at = (i) => [pts[i][0] - frame.vertexN[i][0] * k[i], pts[i][1] - frame.vertexN[i][1] * k[i]];
  for (let pass = 0; pass < 60; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = at(i), b = at(j);
      const ex = pts[j][0] - pts[i][0], ey = pts[j][1] - pts[i][1], length = hypot(ex, ey);
      if ((b[0] - a[0]) * ex + (b[1] - a[1]) * ey < 0.2 * length * length) { k[i] *= 0.85; k[j] *= 0.85; changed = true; }
    }
    if (!changed) break;
  }
  return pts.map((_, i) => at(i));
}

/** True when no two non-adjacent edges of the closed ring cross. */
export function isSimpleRing(ring) {
  const n = ring.length;
  const side = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = ring[j], d = ring[(j + 1) % n];
      if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return false;
    }
  }
  return true;
}

/** Ear clipping for a simple counter-clockwise polygon without holes; returns vertex index triples. */
export function triangulate(ring) {
  const n = ring.length;
  const next = Array.from({ length: n }, (_, i) => (i + 1) % n);
  const prev = Array.from({ length: n }, (_, i) => (i - 1 + n) % n);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const triangles = [];
  let remaining = n, at = 0, guard = 0;
  while (remaining > 3 && guard++ < n * n * 4) {
    const a = prev[at], b = at, c = next[at];
    let ear = cross(ring[a], ring[b], ring[c]) > 1e-12;
    if (ear) {
      for (let k = next[c]; k !== a; k = next[k]) {
        const p = ring[k];
        const same = (q) => p[0] === q[0] && p[1] === q[1];
        if (same(ring[a]) || same(ring[b]) || same(ring[c])) continue;
        if (inside(p, ring[a], ring[b], ring[c])) { ear = false; break; }
      }
    }
    if (ear) {
      triangles.push([a, b, c]);
      next[a] = c; prev[c] = a; remaining--; at = c;
    } else {
      at = next[at];
    }
  }
  if (remaining === 3) {
    const a = prev[at], b = at, c = next[at];
    if (Math.abs(cross(ring[a], ring[b], ring[c])) > 1e-12) triangles.push([a, b, c]);
  } else if (remaining > 3) {
    throw new Error(`triangulate: stuck with ${remaining} vertices left`);
  }
  return triangles;
}

export function newBuffer() { return { positions: [], normals: [], uvs: [], indices: [] }; }

function pushVertex(buffer, x, y, z, nx, ny, nz, u, v) {
  buffer.positions.push(x, y, z); buffer.normals.push(nx, ny, nz); buffer.uvs.push(u, v);
  return buffer.positions.length / 3 - 1;
}

/** Order a triangle so Babylon's front face is the side the normal points to. */
function pushTriangle(buffer, a, b, c, nx, ny, nz) {
  const P = buffer.positions;
  const ux = P[a * 3] - P[b * 3], uy = P[a * 3 + 1] - P[b * 3 + 1], uz = P[a * 3 + 2] - P[b * 3 + 2];
  const vx = P[c * 3] - P[b * 3], vy = P[c * 3 + 1] - P[b * 3 + 1], vz = P[c * 3 + 2] - P[b * 3 + 2];
  const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
  if (fx * nx + fy * ny + fz * nz >= 0) buffer.indices.push(a, b, c); else buffer.indices.push(a, c, b);
}

function addCap(buffer, inset, uvOf) {
  const base = buffer.positions.length / 3;
  inset.forEach(([x, y]) => { const [u, v] = uvOf(x, y); pushVertex(buffer, x, y, 0, 0, 0, -1, u, v); });
  for (const [a, b, c] of triangulate(inset)) pushTriangle(buffer, base + a, base + b, base + c, 0, 0, -1);
}

function edgeNormal(frame, i, segment) { return frame.sharp[i] ? frame.edgeN[segment] : frame.vertexN[i]; }

/** One quad strip between two contours; flat shaded across sharp corners, smooth elsewhere. */
function addStrip(buffer, frame, rowA, rowB, normalAt) {
  for (let i = 0; i < frame.n; i++) {
    const j = (i + 1) % frame.n;
    const na0 = normalAt(i, i), na1 = normalAt(j, i);
    const a0 = pushVertex(buffer, rowA.points[i][0], rowA.points[i][1], rowA.z, na0[0], na0[1], na0[2], 0, 0);
    const a1 = pushVertex(buffer, rowA.points[j][0], rowA.points[j][1], rowA.z, na1[0], na1[1], na1[2], 0, 0);
    const b0 = pushVertex(buffer, rowB.points[i][0], rowB.points[i][1], rowB.z, na0[0], na0[1], na0[2], 0, 0);
    const b1 = pushVertex(buffer, rowB.points[j][0], rowB.points[j][1], rowB.z, na1[0], na1[1], na1[2], 0, 0);
    const edge = frame.edgeN[i], mz = (na0[2] + na1[2]) / 2;
    pushTriangle(buffer, a0, b0, b1, edge[0], edge[1], mz);
    pushTriangle(buffer, a0, b1, a1, edge[0], edge[1], mz);
  }
}

/** A wing or helmet piece placed in the emblem: wings rotate about their hinge, the helmet moves forward. */
export function placer(side) {
  if (!side) return { p: (x, y, z) => [x, y, z + PLACEMENT.helmetForward], n: (x, y, z) => [x, y, z] };
  const rad = PLACEMENT.sweepDeg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad) * side, pivot = PLACEMENT.pivotX * side;
  return {
    p: (x, y, z) => { const dx = x - pivot; return [pivot + dx * c - z * s, y, dx * s + z * c]; },
    n: (x, y, z) => [x * c - z * s, y, x * s + z * c],
  };
}

function place(buffer, from, placement) {
  const P = buffer.positions, N = buffer.normals;
  for (let i = from; i < P.length; i += 3) {
    const p = placement.p(P[i], P[i + 1], P[i + 2]);
    P[i] = p[0]; P[i + 1] = p[1]; P[i + 2] = p[2];
    if (N && N.length) { const n = placement.n(N[i], N[i + 1], N[i + 2]); N[i] = n[0]; N[i + 1] = n[1]; N[i + 2] = n[2]; }
  }
}

/** Glow ribbon along one outline: uv = (distance round the ring 0..1, across 0..1), uv2 = (start delay, 0). */
function addRibbon(buffer, frame, { wIn, wOut, z }) {
  const { origin, maxDelayDist } = RIBBON;
  let start = 0, nearest = Infinity;
  frame.points.forEach((p, i) => { const d = hypot(p[0] - origin[0], p[1] - origin[1]); if (d < nearest) { nearest = d; start = i; } });
  const delay = Math.min(1, nearest / maxDelayDist);
  const base = buffer.positions.length / 3;
  for (let i = 0; i < frame.n; i++) {
    const p = frame.points[i], m = frame.vertexN[i], k = Math.min(m[2], 1.6);
    const ds = (frame.s[i] - frame.s[start] + frame.total) % frame.total;
    const along = Math.min(ds, frame.total - ds) / (frame.total / 2);
    buffer.positions.push(p[0] - m[0] * wIn * k, p[1] - m[1] * wIn * k, z, p[0] + m[0] * wOut * k, p[1] + m[1] * wOut * k, z);
    buffer.normals.push(m[0], m[1], 0, m[0], m[1], 0);
    buffer.uvs.push(along, 0, along, 1);
    buffer.uvs2.push(delay, 0, delay, 0);
  }
  for (let i = 0; i < frame.n; i++) {
    const a = base + i * 2, b = base + ((i + 1) % frame.n) * 2;
    buffer.indices.push(a, a + 1, b + 1, a, b + 1, b);
  }
}

/** The longest run of upward-facing edges of a wing, ordered from the helmet outwards: the arc's channel. */
function topEdge(ring) {
  const frame = ringFrame(resampleRing(ring, ARC_EDGE.resample));
  const up = (i) => frame.edgeN[i][1] > ARC_EDGE.upwardMinNy;
  let best = null;
  for (let i = 0; i < frame.n; i++) {
    if (!up(i) || up((i - 1 + frame.n) % frame.n)) continue;
    const run = [];
    for (let k = 0; k < frame.n && up((i + k) % frame.n); k++) run.push((i + k) % frame.n);
    if (!best || run.length > best.length) best = run;
  }
  if (!best) throw new Error('a wing has no upward-facing edge for its arc');
  let points = best.map((i) => ({ x: frame.points[i][0], y: frame.points[i][1], nx: frame.edgeN[i][0], ny: frame.edgeN[i][1] }));
  if (Math.abs(points[0].x) > Math.abs(points.at(-1).x)) points = points.reverse();
  return points;
}

/**
 * Everything the runtime needs, from the logo's rings (logo units, y down): { wings, helmet } as
 * pickEmblemRings returns them. Wings keep their logo order: right top, left top, right middle,
 * left middle, right low, left low.
 */
export function buildEmblemMesh({ wings, helmet }, pad = 6) {
  const pieces = [...wings.map((ring) => ({ ring, kind: 'wing' })), ...helmet.map((ring) => ({ ring, kind: 'helmet' }))];
  const all = pieces.flatMap((piece) => piece.ring);
  const x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0]));
  const y0 = Math.min(...all.map((p) => p[1])), y1 = Math.max(...all.map((p) => p[1]));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const box = { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  const toWorld = ([x, y]) => [(x - cx) * SCALE, -(y - cy) * SCALE];
  const uvOf = (x, y) => [((x / SCALE + cx) - box.x0) / (box.x1 - box.x0), ((-y / SCALE + cy) - box.y0) / (box.y1 - box.y0)];

  const cap = newBuffer(), side = newBuffer(), halo = { ...newBuffer(), uvs2: [] }, current = { ...newBuffer(), uvs2: [] };
  const arcs = [];
  const checks = [];
  pieces.forEach(({ ring, kind }, index) => {
    const world = counterClockwise(ring.map(toWorld));
    const meanX = world.reduce((sum, p) => sum + p[0], 0) / world.length;
    const sideSign = kind === 'helmet' ? 0 : Math.sign(meanX);
    const { depth: depthUnits, bevel: bevelUnits } = PIECE[kind];
    const depth = depthUnits * SCALE, bevel = bevelUnits * SCALE;
    const frame = ringFrame(world);
    const inset = insetRing(frame, bevel);
    checks.push({ index, kind, simple: isSimpleRing(inset), area: signedArea(frame.points), insetArea: signedArea(inset) });
    const placement = placer(sideSign);

    const capFrom = cap.positions.length, sideFrom = side.positions.length;
    addCap(cap, inset, uvOf);
    const bevelNormal = (i, segment) => { const n = edgeNormal(frame, i, segment); return [n[0] * Math.SQRT1_2, n[1] * Math.SQRT1_2, -Math.SQRT1_2]; };
    const wallNormal = (i, segment) => { const n = edgeNormal(frame, i, segment); return [n[0], n[1], 0]; };
    addStrip(side, frame, { points: inset, z: 0 }, { points: frame.points, z: bevel }, bevelNormal);
    addStrip(side, frame, { points: frame.points, z: bevel }, { points: frame.points, z: depth }, wallNormal);
    place(cap, capFrom, placement);
    place(side, sideFrom, placement);

    const ribbonFrame = ringFrame(resampleRing(frame.points, RIBBON.maxSeg));
    const haloFrom = halo.positions.length, currentFrom = current.positions.length;
    addRibbon(halo, ribbonFrame, { wIn: RIBBON.wIn, wOut: RIBBON.wOut, z: depth * RIBBON.haloZ });
    addRibbon(current, ribbonFrame, { wIn: RIBBON.currentWidth, wOut: RIBBON.currentWidth, z: RIBBON.currentZ });
    // Ribbon normals are 2D outward directions the shader compares with the pointer: place positions only.
    place(halo, haloFrom, { p: placement.p, n: (x, y, z) => [x, y, z] });
    place(current, currentFrom, { p: placement.p, n: (x, y, z) => [x, y, z] });

    if (kind === 'wing') arcs.push({ index: arcs.length, side: sideSign, points: topEdge(frame.points) });
  });

  return {
    meshes: { cap, side, halo, current },
    arcs,
    box, centre: [cx, cy], widthUnits: x1 - x0, heightUnits: y1 - y0,
    checks,
  };
}

/** The padded box the surface maps cover, in logo units, with the rings those maps are cut from. */
export function surfaceMapSource({ wings, helmet }, pad = 6) {
  const rings = [...wings, ...helmet];
  const all = rings.flat();
  const box = {
    x0: Math.min(...all.map((p) => p[0])) - pad, y0: Math.min(...all.map((p) => p[1])) - pad,
    x1: Math.max(...all.map((p) => p[0])) + pad, y1: Math.max(...all.map((p) => p[1])) + pad,
  };
  return { rings, box };
}
