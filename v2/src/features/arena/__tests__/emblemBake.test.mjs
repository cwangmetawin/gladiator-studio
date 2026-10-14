// Run with npm run test:unit. The 3D emblem's baked files (Phase 4 M1): they must be what the bake script
// makes from public/gladiator-logo.svg today (the siteIcon test's third test, for the 3D emblem), they must
// parse with the runtime's own reader, and the geometry must be sound: triangulation conserves area, bevel
// insets are simple rings, every triangle faces its normal, indices stay in range, and the 3D emblem is cut
// from the same paths as the 2D gate emblem.
// MUTATE_BAKE_LOGO=1 bakes from a logo with one wing path nudged (red: the committed files are then stale).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const root = new URL('../../../../', import.meta.url); // v2/
const { bakeEmblem, OUTPUT, MAP_WIDTH } = await import(new URL('scripts/bake-emblem.mjs', root));
const { pickEmblemRings, WING_PATHS, HELMET_PATHS } = await import(new URL('scripts/emblemSource.mjs', root));
const { buildEmblem } = await import(new URL('scripts/emblem.mjs', root));
const geometry = await import(new URL('scripts/arena/geometry.mjs', root));
const { decodePng, encodePng } = await import(new URL('scripts/arena/png.mjs', root));
const { parseEmblem } = await createLoader().load('features/arena/emblemFormat.ts');

let logo = readFileSync(new URL('public/gladiator-logo.svg', root), 'utf8');
if (process.env.MUTATE_BAKE_LOGO) {
  const target = /(<path d="M0 0 C1\.62345462)/;
  assert.match(logo, target, 'bake mutation target not found');
  logo = logo.replace(target, '<path d="M0 0 C1.9');
}
const baked = bakeEmblem(logo);
const onDisk = (relative) => readFileSync(new URL(relative, root));

test('public/arena/emblem.bin and the two maps are what the bake makes from the logo today, and are not stale', () => {
  assert.ok(onDisk(OUTPUT.bin).equals(baked.bin), 'emblem.bin is stale: run node scripts/bake-emblem.mjs');
  for (const [name, fresh] of [['normal', baked.normalPng], ['rough', baked.roughPng]]) {
    const a = decodePng(onDisk(OUTPUT[name])), b = decodePng(fresh);
    assert.deepEqual([a.width, a.height, a.channels], [b.width, b.height, b.channels], `${name} map size`);
    assert.ok(a.pixels.equals(b.pixels), `${name} map pixels are stale: run node scripts/bake-emblem.mjs`);
  }
});

test('the bake records what it was cut from, so a changed logo or changed parameters are caught', () => {
  const header = parseHeader(baked.bin);
  assert.match(header.info.source, /^[0-9a-f]{64}$/);
  assert.match(header.info.params, /^[0-9a-f]{64}$/);
  assert.equal(header.maps.normal.width, MAP_WIDTH.normal);
  assert.equal(header.maps.rough.width, MAP_WIDTH.rough);
});

function parseHeader(buffer) {
  const length = buffer.readUInt32LE(8);
  return JSON.parse(buffer.subarray(12, 12 + length).toString('utf8'));
}

test('the runtime reader parses the committed file: sizes, ranges, unit normals, six arcs, valid indices', () => {
  const file = onDisk(OUTPUT.bin);
  const asset = parseEmblem(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  assert.equal(asset.scale, 0.01);
  assert.ok(asset.width > 9 && asset.width < 9.6, `width ${asset.width}`);
  assert.equal(asset.arcs.length, 6);
  assert.deepEqual(asset.arcs.map((arc) => arc.side), [1, -1, 1, -1, 1, -1], 'feathers alternate right, left like the 2D arcs');
  for (const arc of asset.arcs) {
    assert.ok(arc.points.length / 4 > 40, 'an arc channel has many points');
    assert.ok(Math.abs(arc.points[0]) < Math.abs(arc.points[arc.points.length - 4]), 'channels run from the helmet outwards');
  }
  for (const [name, mesh] of Object.entries({ cap: asset.cap, side: asset.side, halo: asset.halo, current: asset.current })) {
    const n = mesh.positions.length / 3;
    assert.ok(n > 0 && mesh.normals.length === n * 3, `${name} vertex arrays line up`);
    for (let i = 0; i < n; i++) {
      const length = Math.hypot(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]);
      assert.ok(Math.abs(length - 1) < 1e-5, `${name} normal ${i} is unit length`);
    }
    assert.ok(mesh.indices.every((index) => index < n), `${name} indices are in range`);
  }
  assert.ok(asset.cap.uvs && asset.cap.uvs.every((uv) => uv >= 0 && uv <= 1), 'cap uvs are in the map box');
  assert.equal(asset.side.uvs, null);
  assert.deepEqual(asset.maps.normal.file, 'emblem-normal.png');
  assert.ok(asset.halo.uvs2.every((v, i) => (i % 2 ? v === 0 : v >= 0 && v <= 1)), 'ribbon start delays are 0..1');
  assert.ok(asset.halo.uvs.every((v, i) => (i % 2 ? v === 0 || v === 1 : v >= 0 && v <= 1)), 'ribbon uv: along 0..1, across 0 or 1');
});

test('the reader rejects a damaged file instead of reading past it', () => {
  const file = onDisk(OUTPUT.bin);
  const copy = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  assert.throws(() => parseEmblem(copy(file.subarray(0, 11))), /too short/);
  const wrongMagic = Buffer.from(file); wrongMagic.write('NOPE', 0, 'ascii');
  assert.throws(() => parseEmblem(copy(wrongMagic)), /not an emblem file/);
  const wrongVersion = Buffer.from(file); wrongVersion.writeUInt32LE(9, 4);
  assert.throws(() => parseEmblem(copy(wrongVersion)), /unsupported version 9/);
  assert.throws(() => parseEmblem(copy(file.subarray(0, file.length - 400))), /runs past the end/);
  // An index that points past its vertices is refused: rewrite the cap's vertex count to 3 in a copy.
  const header = parseHeader(file);
  header.meshes.cap.vertexCount = 3;
  const json = JSON.stringify(header);
  const original = file.subarray(12, 12 + file.readUInt32LE(8)).toString('utf8').trimEnd();
  const padded = json + ' '.repeat((4 - (Buffer.byteLength(json) % 4)) % 4);
  const patched = Buffer.concat([file.subarray(0, 8), Buffer.alloc(4), Buffer.from(padded), file.subarray(12 + file.readUInt32LE(8))]);
  patched.writeUInt32LE(Buffer.byteLength(padded), 8);
  assert.notEqual(json, original);
  assert.throws(() => parseEmblem(copy(patched)), /outside its vertices|runs past the end/);
});

test('the 3D emblem is cut from the same paths, in the same order, as the 2D gate emblem', () => {
  const rings = pickEmblemRings(logo);
  assert.equal(rings.wings.length, WING_PATHS.length);
  assert.equal(rings.helmet.length, HELMET_PATHS.length);
  const flat = buildEmblem(logo);
  assert.equal(flat.wings.length, rings.wings.length);
  assert.equal(flat.helmet.length, rings.helmet.length);
  const feathers = parseEmblem(Uint8Array.from(onDisk(OUTPUT.bin)).buffer).arcs;
  assert.equal(feathers.length, flat.featherEdges.length, 'one arc channel per 2D feather');
  flat.featherEdges.forEach((edge, i) => {
    const side = Math.sign(edge.x0 + edge.x1 - (flat.width));
    assert.equal(feathers[i].side, side, `feather ${i} is on the same side in 2D and 3D`);
  });
});

// ── geometry ───────────────────────────────────────────────────────────────────────────────────────────

const area = (ring) => Math.abs(geometry.signedArea(ring));

test('ear clipping conserves area on a concave polygon and rejects nothing it can cut', () => {
  const l = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]];
  const triangles = geometry.triangulate(l);
  assert.equal(triangles.length, l.length - 2);
  const sum = triangles.reduce((total, [a, b, c]) => total + area([l[a], l[b], l[c]]), 0);
  assert.ok(Math.abs(sum - area(l)) < 1e-9, `triangle areas ${sum} vs polygon ${area(l)}`);
  assert.equal(geometry.triangulate([[0, 0], [1, 0], [0, 1]]).length, 1, 'a triangle is one triangle');
});

test('every piece of the emblem triangulates into exactly its own area, and its bevel inset is a simple ring', () => {
  const picked = pickEmblemRings(logo);
  const built = geometry.buildEmblemMesh(picked);
  assert.equal(built.checks.length, 10);
  for (const check of built.checks) {
    assert.ok(check.simple, `piece ${check.index} (${check.kind}) bevel inset is a simple ring`);
    const ratio = check.insetArea / check.area;
    assert.ok(ratio > 0.5 && ratio < 0.98, `piece ${check.index}: the inset is smaller than the outline but not collapsed (${ratio.toFixed(3)})`);
  }
  // Triangle areas of the cap equal the insets' areas (the planar cap is unaffected by the wing sweep except by cos).
  const capArea = (() => {
    const P = built.meshes.cap.positions, I = built.meshes.cap.indices;
    let total = 0;
    for (let t = 0; t < I.length; t += 3) {
      const [a, b, c] = [I[t], I[t + 1], I[t + 2]].map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      total += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    }
    return total;
  })();
  const insetTotal = built.checks.reduce((sum, check) => sum + Math.abs(check.insetArea), 0);
  assert.ok(capArea / insetTotal > 0.99 && capArea / insetTotal < 1.001, `cap area ${capArea} vs insets ${insetTotal}`);
});

test('every solid triangle faces the way its vertex normals point (Babylon front face = (A-B)x(C-B))', () => {
  const built = geometry.buildEmblemMesh(pickEmblemRings(logo));
  for (const name of ['cap', 'side']) {
    const { positions: P, normals: N, indices: I } = built.meshes[name];
    let wrong = 0;
    for (let t = 0; t < I.length; t += 3) {
      const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
      const ux = P[a * 3] - P[b * 3], uy = P[a * 3 + 1] - P[b * 3 + 1], uz = P[a * 3 + 2] - P[b * 3 + 2];
      const vx = P[c * 3] - P[b * 3], vy = P[c * 3 + 1] - P[b * 3 + 1], vz = P[c * 3 + 2] - P[b * 3 + 2];
      const f = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const n = [0, 1, 2].map((k) => N[a * 3 + k] + N[b * 3 + k] + N[c * 3 + k]);
      if (f[0] * n[0] + f[1] * n[1] + f[2] * n[2] < -1e-12) wrong += 1;
    }
    assert.equal(wrong, 0, `${name}: ${wrong} of ${I.length / 3} triangles face away from their normals`);
  }
  // The cap is the front: it faces the camera, which sits at negative z.
  const cap = built.meshes.cap;
  for (let i = 0; i < cap.normals.length; i += 3) assert.ok(cap.normals[i + 2] < -0.9, 'cap normals point at the camera');
});

test('the wings sweep back about their hinge and the helmet stands in front of them', () => {
  const built = geometry.buildEmblemMesh(pickEmblemRings(logo));
  const sideP = built.meshes.side.positions;
  let tipZ = -Infinity, helmetFrontZ = Infinity;
  for (let i = 0; i < sideP.length; i += 3) {
    if (Math.abs(sideP[i]) > 4.4) tipZ = Math.max(tipZ, sideP[i + 2]);
    if (Math.abs(sideP[i]) < 0.1) helmetFrontZ = Math.min(helmetFrontZ, sideP[i + 2]);
  }
  assert.ok(tipZ > 0.5, `wing tips are swept well behind the plane (${tipZ.toFixed(3)})`);
  assert.ok(helmetFrontZ < -0.05, `the helmet's front is in front of the plane (${helmetFrontZ.toFixed(3)})`);
});

// ── the PNG codec the maps use ────────────────────────────────────────────────────────────────────────

test('the PNG writer and reader round-trip RGB and RGBA pixels exactly', () => {
  for (const channels of [3, 4]) {
    const width = 37, height = 19, pixels = Buffer.alloc(width * height * channels);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 31 + (i >> 3) * 7) & 255;
    const decoded = decodePng(encodePng(width, height, channels, pixels));
    assert.deepEqual([decoded.width, decoded.height, decoded.channels], [width, height, channels]);
    assert.ok(decoded.pixels.equals(pixels));
  }
  assert.throws(() => encodePng(2, 2, 3, Buffer.alloc(5)), /pixel count/);
});

test('the normal map is smooth where the metal is flat and tilted inside the chisel; the roughness map is mostly the steel value', () => {
  const normal = decodePng(onDisk(OUTPUT.normal)), rough = decodePng(onDisk(OUTPUT.rough));
  assert.equal(normal.channels, 3); assert.equal(rough.channels, 3);
  const mid = (x, y, map) => map.pixels.subarray((y * map.width + x) * 3, (y * map.width + x) * 3 + 3);
  const corner = mid(1, 1, normal);
  assert.equal(corner[0], 128, 'outside every shape there is no sideways tilt');
  assert.ok(Math.abs(corner[1] - 128) < 14, 'only the faint brushing tilts it up or down');
  assert.ok(corner[2] > 250, 'and the normal still points straight out');
  // Roughness lives in green, metallic in blue, and red is unused (kept at 1 so an occlusion read stays neutral).
  const sample = mid(Math.floor(rough.width / 2), Math.floor(rough.height / 2), rough);
  assert.equal(sample[0], 255); assert.equal(sample[2], 255);
  assert.ok(sample[1] > 40 && sample[1] < 110, `steel roughness about 0.24 (${sample[1]}/255)`);
});
