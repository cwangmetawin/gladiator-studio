// The binary container for the baked emblem (public/arena/emblem.bin), read at runtime by
// src/features/arena/emblemFormat.ts. Layout, little endian:
//   'GLEM' | u32 version | u32 jsonLength | json (UTF-8, space padded to a multiple of 4) | data blob
// The JSON holds counts, offsets (relative to the blob) and the placement/box constants; the blob holds
// quantised vertex data, each array 4-byte aligned:
//   positions i16 x3 (value = int * positionStep), normals i8 (value = int / 127), uvs u16 / 65535,
//   ribbon progress u16 / 65535, ribbon delay u8 / 255, indices u16, arc points f32 x4 (x, y, nx, ny).
// Ribbons have two vertices per outline sample (inside, outside): the "across" coordinate is the vertex
// parity, so it is not stored.

export const FORMAT_VERSION = 1;
const MAGIC = 'GLEM';

class Blob {
  constructor() { this.parts = []; this.length = 0; }
  add(typed) {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const offset = this.length;
    this.parts.push(bytes);
    this.length += bytes.length;
    const pad = (4 - (this.length % 4)) % 4;
    if (pad) { this.parts.push(Buffer.alloc(pad)); this.length += pad; }
    return offset;
  }
  toBuffer() { return Buffer.concat(this.parts); }
}

const clampInt = (value, limit) => Math.max(-limit, Math.min(limit, Math.round(value)));

/** The smallest step that keeps every coordinate inside int16, rounded up to 4 decimals so it is readable. */
export function positionStep(meshes) {
  let max = 0;
  for (const mesh of Object.values(meshes)) for (const v of mesh.positions) max = Math.max(max, Math.abs(v));
  return Math.ceil((max / 32767) * 1e6) / 1e6;
}

function quantisePositions(positions, step) {
  const out = new Int16Array(positions.length);
  for (let i = 0; i < positions.length; i++) out[i] = clampInt(positions[i] / step, 32767);
  return out;
}

function quantiseNormals(normals, components) {
  const count = normals.length / 3, out = new Int8Array(count * components);
  for (let i = 0; i < count; i++) for (let c = 0; c < components; c++) out[i * components + c] = clampInt(normals[i * 3 + c] * 127, 127);
  return out;
}

const quantiseUnit16 = (values) => Uint16Array.from(values, (v) => Math.max(0, Math.min(65535, Math.round(v * 65535))));
const quantiseUnit8 = (values) => Uint8Array.from(values, (v) => Math.max(0, Math.min(255, Math.round(v * 255))));

/** Pick every other entry of a flat array of pairs: the first component of each pair. */
const firstOfPairs = (values) => { const out = []; for (let i = 0; i < values.length; i += 2) out.push(values[i]); return out; };

/** The ribbons' "along" coordinate sits in uv.x of each vertex, the start delay in uv2.x. */
function packRibbon(blob, mesh, step) {
  return {
    vertexCount: mesh.positions.length / 3, indexCount: mesh.indices.length,
    position: blob.add(quantisePositions(mesh.positions, step)),
    normal: blob.add(quantiseNormals(mesh.normals, 2)),
    along: blob.add(quantiseUnit16(firstOfPairs(mesh.uvs))),
    delay: blob.add(quantiseUnit8(firstOfPairs(mesh.uvs2))),
    indices: blob.add(Uint16Array.from(mesh.indices)),
  };
}

/**
 * built: buildEmblemMesh's result. maps: { normal: {file, width, height}, rough: {...} }.
 * info: { sources, params } recorded for the staleness test. Returns the file's bytes.
 */
export function packEmblem(built, maps, info, placement, scale) {
  const { meshes } = built;
  for (const [name, mesh] of Object.entries(meshes)) {
    if (mesh.positions.length / 3 > 65535) throw new Error(`${name}: more than 65535 vertices do not fit u16 indices`);
  }
  const step = positionStep(meshes);
  const blob = new Blob();
  const layout = {
    cap: {
      vertexCount: meshes.cap.positions.length / 3, indexCount: meshes.cap.indices.length,
      position: blob.add(quantisePositions(meshes.cap.positions, step)),
      normal: blob.add(quantiseNormals(meshes.cap.normals, 3)),
      uv: blob.add(quantiseUnit16(meshes.cap.uvs)),
      indices: blob.add(Uint16Array.from(meshes.cap.indices)),
    },
    side: {
      vertexCount: meshes.side.positions.length / 3, indexCount: meshes.side.indices.length,
      position: blob.add(quantisePositions(meshes.side.positions, step)),
      normal: blob.add(quantiseNormals(meshes.side.normals, 3)),
      indices: blob.add(Uint16Array.from(meshes.side.indices)),
    },
    halo: packRibbon(blob, meshes.halo, step),
    current: packRibbon(blob, meshes.current, step),
  };
  const arcs = built.arcs.map((arc) => {
    const floats = new Float32Array(arc.points.length * 4);
    arc.points.forEach((p, i) => { floats.set([p.x, p.y, p.nx, p.ny], i * 4); });
    return { side: arc.side, count: arc.points.length, offset: blob.add(floats) };
  });
  const header = {
    version: FORMAT_VERSION, scale, positionStep: step, placement,
    box: { widthUnits: built.widthUnits, heightUnits: built.heightUnits, centre: built.centre, mapBox: built.box },
    meshes: layout, arcs, maps, info,
  };
  let json = JSON.stringify(header);
  json += ' '.repeat((4 - (Buffer.byteLength(json) % 4)) % 4);
  const head = Buffer.alloc(12);
  head.write(MAGIC, 0, 'ascii');
  head.writeUInt32LE(FORMAT_VERSION, 4);
  head.writeUInt32LE(Buffer.byteLength(json), 8);
  return Buffer.concat([head, Buffer.from(json, 'utf8'), blob.toBuffer()]);
}
