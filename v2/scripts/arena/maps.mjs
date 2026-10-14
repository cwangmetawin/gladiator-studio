// The 3D emblem's surface maps for the front faces, cut at build time (bake-emblem.mjs).
// A Euclidean distance field of the shapes gives a chisel height (two facets meet on the medial axis of
// each wing feather, like the brand hero render); horizontal brushed streaks ride on top. Output: an RGB
// tangent-space normal map and an RGB "ORM-style" map in glTF layout (G = roughness, B = metallic).
// No canvas and no dependencies: the shapes are rasterised here with an even-odd scanline fill.

function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/** Felzenszwalb's exact squared Euclidean distance, in place: f holds 0 outside and a huge value inside. */
export function edt2d(f, w, h) {
  const n = Math.max(w, h), col = new Float64Array(n), d = new Float64Array(n);
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = f[y * w + x];
    edt1d(col, h, d, v, z);
    for (let y = 0; y < h; y++) f[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) col[x] = f[y * w + x];
    edt1d(col, w, d, v, z);
    for (let x = 0; x < w; x++) f[y * w + x] = d[x];
  }
}

/** Integer hash noise in [-1, 1): deterministic on every engine (only int32 arithmetic and one modulo). */
export function hash(n) {
  n = (n << 13) ^ n;
  return 1 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824;
}

/** Brushed streak noise: independent per row, slowly varying along x. */
export function streak(x, y, period) {
  const t = x / period, i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f), row = y * 7919;
  return hash(row + i) * (1 - s) + hash(row + i + 1) * s;
}

/** Separable box blur, run twice (about Gaussian): removes the pixel staircase of the distance field. */
export function blurHeight(src, w, h, r) {
  const tmp = new Float32Array(src.length);
  const pass = (from, to, len, count, stride, step) => {
    for (let c = 0; c < count; c++) {
      const base = c * stride;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += from[base + Math.min(len - 1, Math.max(0, k)) * step];
      for (let i = 0; i < len; i++) {
        to[base + i * step] = acc / (2 * r + 1);
        acc += from[base + Math.min(len - 1, i + r + 1) * step] - from[base + Math.max(0, i - r) * step];
      }
    }
  };
  for (let it = 0; it < 2; it++) {
    pass(src, tmp, w, h, w, 1);
    pass(tmp, src, h, w, 1, w);
  }
  return src;
}

/** Even-odd scanline fill of closed rings (logo units) into a w x h mask: 1 inside, 0 outside. */
export function rasterMask(rings, box, w, h) {
  const mask = new Uint8Array(w * h);
  const sx = w / (box.x1 - box.x0), sy = h / (box.y1 - box.y0);
  const edges = [];
  for (const ring of rings) {
    for (let i = 0, n = ring.length; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      const a = [(p[0] - box.x0) * sx, (p[1] - box.y0) * sy], b = [(q[0] - box.x0) * sx, (q[1] - box.y0) * sy];
      if (a[1] !== b[1]) edges.push(a[1] < b[1] ? [a, b] : [b, a]);
    }
  }
  for (let y = 0; y < h; y++) {
    const yc = y + 0.5, hits = [];
    for (const [a, b] of edges) if (yc >= a[1] && yc < b[1]) hits.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    hits.sort((m, n) => m - n);
    for (let k = 0; k + 1 < hits.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(hits[k] - 0.5)); x <= Math.min(w - 1, Math.ceil(hits[k + 1] - 0.5) - 1); x++) mask[y * w + x] = 1;
    }
  }
  return mask;
}

export const MAP_OPTIONS = Object.freeze({
  chiselDepth: 11, chiselSlope: 0.95, streakPeriod: 34, streakTilt: 0.06, roughness: 0.24, roughnessStreak: 0.07, blur: 2,
});

/**
 * rings: closed rings in logo units; box: the padded logo-unit box the UVs map to; width: map width in px.
 * Returns { width, height, normal, rough }: tightly packed RGB bytes, row 0 = the top of the box.
 */
export function buildSurfaceMaps(rings, box, width, options = MAP_OPTIONS) {
  const height = Math.round(width * (box.y1 - box.y0) / (box.x1 - box.x0));
  const mask = rasterMask(rings, box, width, height);
  const count = width * height, field = new Float64Array(count);
  for (let i = 0; i < count; i++) field[i] = mask[i] ? 1e20 : 0;
  edt2d(field, width, height);
  const unit = (box.x1 - box.x0) / width; // logo units per pixel
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) heights[i] = Math.min(Math.sqrt(field[i]) * unit, options.chiselDepth);
  blurHeight(heights, width, height, options.blur);
  const normal = new Uint8Array(count * 3), rough = new Uint8Array(count * 3);
  const slope = options.chiselSlope / (2 * unit), period = options.streakPeriod / unit;
  const byte = (value) => Math.max(0, Math.min(255, Math.round(value)));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const hx = heights[y * width + Math.min(width - 1, x + 1)] - heights[y * width + Math.max(0, x - 1)];
      const hy = heights[Math.min(height - 1, y + 1) * width + x] - heights[Math.max(0, y - 1) * width + x];
      const brush = streak(x, y, period), fine = hash(y * 131 + (x >> 3) * 977) * 0.35;
      let nx = -hx * slope, ny = -hy * slope + (brush + fine) * options.streakTilt, nz = 1;
      const length = Math.hypot(nx, ny, nz);
      nx /= length; ny /= length; nz /= length;
      normal[i * 3] = byte((nx * 0.5 + 0.5) * 255);
      normal[i * 3 + 1] = byte((ny * 0.5 + 0.5) * 255);
      normal[i * 3 + 2] = byte((nz * 0.5 + 0.5) * 255);
      const roughness = options.roughness + brush * options.roughnessStreak + streak(x * 0.15, y >> 4, 40) * 0.03;
      rough[i * 3] = 255;
      rough[i * 3 + 1] = byte(roughness * 255);
      rough[i * 3 + 2] = 255;
    }
  }
  return { width, height, normal, rough };
}
