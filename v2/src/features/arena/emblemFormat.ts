// Reads public/arena/emblem.bin, baked by scripts/bake-emblem.mjs (the layout is documented in
// scripts/arena/pack.mjs). The browser only dequantises: no SVG parsing, no triangulation, no offsets.

export interface PlacementConstants {
  /** Wings hinge about x = +-pivotX (world units) and sweep back by sweepDeg; the helmet moves by helmetForward on z. */
  readonly pivotX: number;
  readonly sweepDeg: number;
  readonly helmetForward: number;
}

export interface SolidMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Present on the front cap only (planar map coordinates). */
  readonly uvs: Float32Array | null;
  readonly indices: Uint16Array;
}

/** A glow ribbon: two vertices per outline sample. uvs = (progress round the ring, across 0|1), uvs2 = (start delay, 0). */
export interface RibbonMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly uvs2: Float32Array;
  readonly indices: Uint16Array;
}

/** The channel an electric arc runs along: a wing's upward-facing edge, helmet outwards. x, y, nx, ny per point. */
export interface ArcEdge {
  readonly side: number;
  readonly points: Float32Array;
}

export interface MapFile {
  readonly file: string;
  readonly width: number;
  readonly height: number;
}

export interface EmblemAsset {
  readonly scale: number;
  readonly placement: PlacementConstants;
  /** The emblem's own size in world units (before wing sweep). */
  readonly width: number;
  readonly height: number;
  readonly cap: SolidMesh;
  readonly side: SolidMesh;
  readonly halo: RibbonMesh;
  readonly current: RibbonMesh;
  readonly arcs: readonly ArcEdge[];
  readonly maps: { readonly normal: MapFile; readonly rough: MapFile };
}

const MAGIC = 'GLEM';
const VERSION = 1;

interface SolidLayout { readonly vertexCount: number; readonly indexCount: number; readonly position: number; readonly normal: number; readonly uv?: number; readonly indices: number }
interface RibbonLayout { readonly vertexCount: number; readonly indexCount: number; readonly position: number; readonly normal: number; readonly along: number; readonly delay: number; readonly indices: number }
interface Header {
  readonly version: number;
  readonly scale: number;
  readonly positionStep: number;
  readonly placement: PlacementConstants;
  readonly box: { readonly widthUnits: number; readonly heightUnits: number };
  readonly meshes: { readonly cap: SolidLayout; readonly side: SolidLayout; readonly halo: RibbonLayout; readonly current: RibbonLayout };
  readonly arcs: readonly { readonly side: number; readonly count: number; readonly offset: number }[];
  readonly maps: { readonly normal: MapFile; readonly rough: MapFile };
}

function reader(buffer: ArrayBuffer, blobStart: number) {
  const view = (offset: number, bytes: number, what: string): number => {
    const start = blobStart + offset;
    if (!Number.isInteger(offset) || offset < 0 || start + bytes > buffer.byteLength) throw new Error(`emblem.bin: ${what} runs past the end of the file`);
    return start;
  };
  return {
    i16: (offset: number, count: number, what: string) => new Int16Array(buffer, view(offset, count * 2, what), count),
    i8: (offset: number, count: number, what: string) => new Int8Array(buffer, view(offset, count, what), count),
    u16: (offset: number, count: number, what: string) => new Uint16Array(buffer, view(offset, count * 2, what), count),
    u8: (offset: number, count: number, what: string) => new Uint8Array(buffer, view(offset, count, what), count),
    f32: (offset: number, count: number, what: string) => new Float32Array(buffer, view(offset, count * 4, what), count),
  };
}

function dequantisePositions(source: Int16Array, step: number): Float32Array {
  const out = new Float32Array(source.length);
  for (let i = 0; i < source.length; i++) out[i] = source[i]! * step;
  return out;
}

/** Normals are stored as int8; unit length again after the round trip. */
function dequantiseNormals(source: Int8Array, components: 2 | 3): Float32Array {
  const count = source.length / components, out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = source[i * components]! / 127, y = source[i * components + 1]! / 127, z = components === 3 ? source[i * components + 2]! / 127 : 0;
    const length = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / length; out[i * 3 + 1] = y / length; out[i * 3 + 2] = z / length;
  }
  return out;
}

function checkIndices(indices: Uint16Array, vertexCount: number, what: string): Uint16Array {
  if (indices.length % 3 !== 0) throw new Error(`emblem.bin: ${what} index count is not a multiple of 3`);
  for (let i = 0; i < indices.length; i++) if (indices[i]! >= vertexCount) throw new Error(`emblem.bin: ${what} index ${i} is outside its vertices`);
  return indices;
}

export function parseEmblem(buffer: ArrayBuffer): EmblemAsset {
  if (buffer.byteLength < 12) throw new Error('emblem.bin: too short');
  const head = new DataView(buffer);
  const magic = String.fromCharCode(head.getUint8(0), head.getUint8(1), head.getUint8(2), head.getUint8(3));
  if (magic !== MAGIC) throw new Error('emblem.bin: not an emblem file');
  if (head.getUint32(4, true) !== VERSION) throw new Error(`emblem.bin: unsupported version ${head.getUint32(4, true)}`);
  const jsonLength = head.getUint32(8, true);
  if (12 + jsonLength > buffer.byteLength || jsonLength % 4 !== 0) throw new Error('emblem.bin: bad header length');
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 12, jsonLength))) as Header;
  if (header.version !== VERSION) throw new Error('emblem.bin: header version mismatch');
  const read = reader(buffer, 12 + jsonLength);
  const step = header.positionStep;

  const solid = (layout: SolidLayout, name: string, hasUv: boolean): SolidMesh => {
    const n = layout.vertexCount;
    const uvSource = hasUv && layout.uv !== undefined ? read.u16(layout.uv, n * 2, `${name} uvs`) : null;
    return {
      positions: dequantisePositions(read.i16(layout.position, n * 3, `${name} positions`), step),
      normals: dequantiseNormals(read.i8(layout.normal, n * 3, `${name} normals`), 3),
      uvs: uvSource ? Float32Array.from(uvSource, (v) => v / 65535) : null,
      indices: checkIndices(read.u16(layout.indices, layout.indexCount, `${name} indices`).slice(), n, name),
    };
  };
  const ribbon = (layout: RibbonLayout, name: string): RibbonMesh => {
    const n = layout.vertexCount;
    const along = read.u16(layout.along, n, `${name} progress`), delay = read.u8(layout.delay, n, `${name} delay`);
    const uvs = new Float32Array(n * 2), uvs2 = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      uvs[i * 2] = along[i]! / 65535; uvs[i * 2 + 1] = i & 1; // the two vertices of a sample: inside (0), outside (1)
      uvs2[i * 2] = delay[i]! / 255;
    }
    return {
      positions: dequantisePositions(read.i16(layout.position, n * 3, `${name} positions`), step),
      normals: dequantiseNormals(read.i8(layout.normal, n * 2, `${name} normals`), 2),
      uvs, uvs2,
      indices: checkIndices(read.u16(layout.indices, layout.indexCount, `${name} indices`).slice(), n, name),
    };
  };

  return {
    scale: header.scale,
    placement: header.placement,
    width: header.box.widthUnits * header.scale,
    height: header.box.heightUnits * header.scale,
    cap: solid(header.meshes.cap, 'cap', true),
    side: solid(header.meshes.side, 'side', false),
    halo: ribbon(header.meshes.halo, 'halo'),
    current: ribbon(header.meshes.current, 'current'),
    arcs: header.arcs.map((arc, i) => ({ side: arc.side, points: read.f32(arc.offset, arc.count * 4, `arc ${i}`).slice() })),
    maps: header.maps,
  };
}
