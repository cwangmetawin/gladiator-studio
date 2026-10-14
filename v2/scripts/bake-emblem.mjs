// Bakes the 3D emblem at build time, so the browser never parses the logo, triangulates, offsets paths
// or computes a distance field: it uploads what this makes.
//   node scripts/bake-emblem.mjs          writes public/arena/emblem.bin, emblem-normal.png, emblem-rough.png
//   node scripts/bake-emblem.mjs --check  exits 1 when one of them is stale
// The shapes come from public/gladiator-logo.svg through scripts/emblemSource.mjs, the same selection the
// 2D gate emblem uses. The studio environment (public/arena/studio.env) is baked separately, in a browser
// (scripts/bake-env.mjs), because Babylon's .env encoder needs a GPU.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pickEmblemRings } from './emblemSource.mjs';
import { PIECE, PLACEMENT, RIBBON, SCALE, buildEmblemMesh, surfaceMapSource } from './arena/geometry.mjs';
import { MAP_OPTIONS, buildSurfaceMaps } from './arena/maps.mjs';
import { FORMAT_VERSION, packEmblem } from './arena/pack.mjs';
import { decodePng, encodePng } from './arena/png.mjs';

/** Map widths in px: the normal map carries the chisel and the brushing, the roughness map only its streaks. */
export const MAP_WIDTH = Object.freeze({ normal: 2048, rough: 1024 });
export const OUTPUT = Object.freeze({ bin: 'public/arena/emblem.bin', normal: 'public/arena/emblem-normal.png', rough: 'public/arena/emblem-rough.png' });

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Pure: the three files' contents and a report, from the logo's text. */
export function bakeEmblem(logoSvg) {
  const picked = pickEmblemRings(logoSvg);
  const built = buildEmblemMesh(picked);
  const bad = built.checks.filter((check) => !check.simple || check.insetArea <= 0);
  if (bad.length) throw new Error(`bake: the bevel inset of piece(s) ${bad.map((c) => c.index).join(', ')} is not a simple ring`);

  const { rings, box } = surfaceMapSource(picked);
  const normalMaps = buildSurfaceMaps(rings, box, MAP_WIDTH.normal);
  const roughMaps = buildSurfaceMaps(rings, box, MAP_WIDTH.rough);
  const normalPng = encodePng(normalMaps.width, normalMaps.height, 3, normalMaps.normal);
  const roughPng = encodePng(roughMaps.width, roughMaps.height, 3, roughMaps.rough);

  const maps = {
    normal: { file: 'emblem-normal.png', width: normalMaps.width, height: normalMaps.height },
    rough: { file: 'emblem-rough.png', width: roughMaps.width, height: roughMaps.height },
  };
  const info = {
    source: sha256(logoSvg),
    params: sha256(JSON.stringify({ SCALE, PLACEMENT, PIECE, RIBBON, MAP_OPTIONS, MAP_WIDTH, FORMAT_VERSION })),
  };
  const bin = packEmblem(built, maps, info, PLACEMENT, SCALE);
  const counts = Object.fromEntries(Object.entries(built.meshes).map(([name, mesh]) => [name, { vertices: mesh.positions.length / 3, triangles: mesh.indices.length / 3 }]));
  return { bin, normalPng, roughPng, report: { counts, bytes: { bin: bin.length, normal: normalPng.length, rough: roughPng.length }, checks: built.checks } };
}

/** Does a file on disk hold what the bake would write? PNGs compare by decoded pixels (zlib differs by version). */
function stale(root, relative, fresh, isPng) {
  let onDisk;
  try { onDisk = readFileSync(new URL(relative, root)); } catch { return true; }
  if (!isPng) return !onDisk.equals(fresh);
  try {
    const a = decodePng(onDisk), b = decodePng(fresh);
    return a.width !== b.width || a.height !== b.height || a.channels !== b.channels || !a.pixels.equals(b.pixels);
  } catch { return true; }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const root = new URL('../', import.meta.url);
  const baked = bakeEmblem(readFileSync(new URL('public/gladiator-logo.svg', root), 'utf8'));
  const files = [[OUTPUT.bin, baked.bin, false], [OUTPUT.normal, baked.normalPng, true], [OUTPUT.rough, baked.roughPng, true]];
  if (process.argv.includes('--check')) {
    const old = files.filter(([relative, data, png]) => stale(root, relative, data, png));
    for (const [relative] of old) console.error(`stale: ${relative}`);
    process.exit(old.length ? 1 : 0);
  }
  mkdirSync(new URL('public/arena/', root), { recursive: true });
  for (const [relative, data] of files) writeFileSync(new URL(relative, root), data);
  console.log(JSON.stringify(baked.report.counts), JSON.stringify(baked.report.bytes));
}
