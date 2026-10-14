// The emblem's studio environment, as a recipe: an equirectangular Radiance .hdr built from analytic
// soft boxes (a JS port of the prototype's gen_env.py). The steel is lit by this and nothing else, so
// the recipe is the look. scripts/bake-env.mjs turns the .hdr into public/arena/studio.env in a browser.
//
// Babylon's HDRCubeTexture maps image column u to azimuth atan2(x, z) = (u - 0.5) * 2 pi
// (u = 0.5 is +z, the way the camera looks; u = 0 is -z, behind the camera) and row v to elevation (top
// row = straight up). The prototype verified this with a mirror-sphere render.

export const ENV_WIDTH = 512;
export const ENV_HEIGHT = 256;
const HOLO = [0.31, 0.765, 0.969];

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));

function softBox(az, el, az0, el0, halfAz, halfEl, soft) {
  const ax = clamp01((halfAz - Math.abs(wrap(az - az0))) / soft + 0.5);
  const ay = clamp01((halfEl - Math.abs(el - el0)) / soft + 0.5);
  return ax * ay;
}

/** Linear radiance (r, g, b) looking along azimuth az (radians, 0 = +z) and elevation el (radians, + = up). */
export function studioRadiance(az, el) {
  const z = Math.cos(az) * Math.cos(el);
  let r = 0.004, g = 0.006, b = 0.011;
  const add = (k, c) => { r += k * c[0]; g += k * c[1]; b += k * c[2]; };

  // studio wall behind the camera: what the flat front faces reflect
  const front = clamp01((-z - 0.05) / 0.55);
  add(front * (0.02 + 0.09 * clamp01((el + 0.25) / 0.9)), [0.78, 0.86, 1.0]);
  add(softBox(az, el, Math.PI, 0.14, 0.95, 0.24, 0.35) * 0.24, [0.85, 0.92, 1.0]);
  // key softbox: upper left behind the camera, warm white
  add(softBox(az, el, -Math.PI + 0.55, 0.45, 0.32, 0.11, 0.07) * 3.2, [1.0, 0.97, 0.93]);
  // zenith softbox: lights the upward facets of the chiselled metal
  add(clamp01((el - 1.12) / 0.1) * 4.6, [0.93, 0.97, 1.0]);
  // tall blue strips left and right (side bevels), the left one stronger
  add(softBox(az, el, -Math.PI / 2, 0.2, 0.09, 0.75, 0.06) * 6.0, HOLO);
  add(softBox(az, el, Math.PI / 2, 0.2, 0.09, 0.75, 0.06) * 4.2, HOLO);
  // blue back band behind the emblem: rims the side walls
  add(softBox(az, el, 0.0, 0.05, 1.0, 0.2, 0.12) * 2.8, HOLO);
  // floor: dark, with a blue glow ring and a faint nadir glow (downward facets)
  add(Math.exp(-(((el + 0.62) / 0.13) ** 2)) * 1.3, HOLO);
  add(clamp01((-el - 1.15) / 0.3) * 0.35, HOLO);
  return [r, g, b];
}

/** Float RGB for an equirectangular image, row 0 = straight up. */
export function studioImage(width = ENV_WIDTH, height = ENV_HEIGHT) {
  const pixels = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const el = Math.PI / 2 - ((y + 0.5) / height) * Math.PI;
    for (let x = 0; x < width; x++) {
      const az = ((x + 0.5) / width - 0.5) * 2 * Math.PI;
      pixels.set(studioRadiance(az, el), (y * width + x) * 3);
    }
  }
  return pixels;
}

function toRgbe(r, g, b) {
  const v = Math.max(r, g, b);
  if (v < 1e-32) return [0, 0, 0, 0];
  const exponent = Math.floor(Math.log2(v)) + 1, scale = 256 / 2 ** exponent;
  return [Math.min(255, Math.floor(r * scale)), Math.min(255, Math.floor(g * scale)), Math.min(255, Math.floor(b * scale)), exponent + 128];
}

function runLength(values, i) {
  let j = i;
  while (j < values.length && j - i < 127 && values[j] === values[i]) j++;
  return j - i;
}

function rleChannel(values, out) {
  let i = 0;
  while (i < values.length) {
    const run = runLength(values, i);
    if (run >= 4) { out.push(128 + run, values[i]); i += run; continue; }
    const literal = [];
    while (i < values.length && literal.length < 128 && runLength(values, i) < 4) literal.push(values[i++]);
    out.push(literal.length, ...literal);
  }
}

/** Radiance .hdr bytes (new-style RLE scanlines) for float RGB pixels. */
export function encodeHdr(width, height, pixels) {
  const out = [...Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`, 'ascii')];
  for (let y = 0; y < height; y++) {
    const channels = [[], [], [], []];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      toRgbe(pixels[i], pixels[i + 1], pixels[i + 2]).forEach((value, c) => channels[c].push(value));
    }
    out.push(2, 2, width >> 8, width & 255);
    channels.forEach((channel) => rleChannel(channel, out));
  }
  return Buffer.from(out);
}

/** The recipe's .hdr, the only input the browser step needs. */
export function studioHdr() {
  return encodeHdr(ENV_WIDTH, ENV_HEIGHT, studioImage());
}
