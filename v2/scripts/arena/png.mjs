// A small PNG writer and reader for the bake (8-bit RGB or RGBA, no interlace), on node:zlib only.
// The writer picks each row's filter by the usual minimum-sum-of-absolute-values rule, so the files stay
// small without a dependency. The reader exists for tests: the bake's output is compared pixel by pixel,
// never byte by byte, because zlib's output differs between Node versions.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

function filterRow(type, row, previous, bpp, out) {
  for (let i = 0; i < row.length; i++) {
    const left = i >= bpp ? row[i - bpp] : 0, up = previous ? previous[i] : 0, upLeft = previous && i >= bpp ? previous[i - bpp] : 0;
    const predictor = type === 0 ? 0 : type === 1 ? left : type === 2 ? up : type === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
    out[i] = (row[i] - predictor) & 0xff;
  }
}

/** pixels: tightly packed bytes, width * height * channels. channels is 3 (RGB) or 4 (RGBA). */
export function encodePng(width, height, channels, pixels, level = 9) {
  if (channels !== 3 && channels !== 4) throw new Error('encodePng: channels must be 3 or 4');
  if (pixels.length !== width * height * channels) throw new Error('encodePng: pixel count does not match the size');
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  const candidate = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * stride, (y + 1) * stride), previous = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    let best = 0, bestScore = Infinity;
    for (let type = 0; type < 5; type++) {
      filterRow(type, row, previous, channels, candidate);
      let score = 0;
      for (let i = 0; i < stride; i++) score += candidate[i] < 128 ? candidate[i] : 256 - candidate[i];
      if (score < bestScore) { bestScore = score; best = type; }
    }
    raw[y * (stride + 1)] = best;
    filterRow(best, row, previous, channels, candidate);
    candidate.copy(raw, y * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = channels === 3 ? 2 : 6; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level })), chunk('IEND', Buffer.alloc(0))]);
}

/** Returns { width, height, channels, pixels } for an 8-bit, non-interlaced RGB or RGBA PNG. */
export function decodePng(file) {
  const data = Buffer.from(file);
  if (!data.subarray(0, 8).equals(SIGNATURE)) throw new Error('decodePng: not a PNG');
  let at = 8, width = 0, height = 0, channels = 0;
  const idat = [];
  while (at < data.length) {
    const length = data.readUInt32BE(at), type = data.toString('ascii', at + 4, at + 8), body = data.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0 || (body[9] !== 2 && body[9] !== 6)) throw new Error('decodePng: only 8-bit RGB or RGBA, not interlaced');
      channels = body[9] === 2 ? 3 : 4;
    } else if (type === 'IDAT') idat.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? out[i - channels] : 0, up = previous ? previous[i] : 0, upLeft = previous && i >= channels ? previous[i - channels] : 0;
      const predictor = type === 0 ? 0 : type === 1 ? left : type === 2 ? up : type === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
      out[i] = (row[i] + predictor) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}
