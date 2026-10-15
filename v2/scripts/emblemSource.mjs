// The one place that says which paths of public/gladiator-logo.svg are the emblem, and turns them into
// simplified closed rings of points in logo units. scripts/emblem.mjs (the 2D gate emblem and the site
// icon) and scripts/bake-emblem.mjs (the 3D emblem's mesh and maps) both read their shapes from here, so
// the 2D and 3D emblems can never be cut from different paths.
// The logo's paths are absolute M/C/Z outlines from an auto-trace. Each is flattened and simplified
// within TOLERANCE logo units (0.1 units is ~0.3 device px with the emblem 1,000 px wide at DPR 3).

/** 1-based path numbers in gladiator-logo.svg: the six wing feathers and the four helmet pieces. */
export const WING_PATHS = [8, 9, 11, 12, 13, 14];
export const HELMET_PATHS = [16, 17, 18, 19];
export const TOLERANCE = 0.1;

export const round1 = value => Math.round(value * 10) / 10;
export const num = value => {
  const text = String(round1(value) === 0 ? 0 : round1(value));
  return text.replace(/^(-?)0\./, '$1.');
};

export function parsePaths(svg) {
  return [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*\btransform="translate\(([-\d.]+),([-\d.]+)\)"/g)]
    .map(([, d, tx, ty]) => ({ d, tx: Number(tx), ty: Number(ty) }));
}

function flattenCubic(p0, p1, p2, p3, out, depth = 0) {
  const dx = p3[0] - p0[0], dy = p3[1] - p0[1];
  const length = Math.hypot(dx, dy) || 1;
  const distance = p => Math.abs((p[0] - p0[0]) * dy - (p[1] - p0[1]) * dx) / length;
  if (depth >= 16 || Math.max(distance(p1), distance(p2)) <= 0.01) { out.push(p3); return; }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const p01 = mid(p0, p1), p12 = mid(p1, p2), p23 = mid(p2, p3);
  const p012 = mid(p01, p12), p123 = mid(p12, p23), centre = mid(p012, p123);
  flattenCubic(p0, p01, p012, centre, out, depth + 1);
  flattenCubic(centre, p123, p23, p3, out, depth + 1);
}

/** Closed rings of absolute points for one logo path (M/C/Z only, as the trace writes them). */
export function rings({ d, tx, ty }) {
  const tokens = d.match(/[MCZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const result = [];
  let ring = null, command = '', i = 0;
  const next = () => Number(tokens[i++]);
  const point = () => { const x = next(); return [x + tx, next() + ty]; };
  while (i < tokens.length) {
    if (/^[MCZ]$/i.test(tokens[i])) command = tokens[i++].toUpperCase();
    if (command === 'M') { ring = [point()]; result.push(ring); command = ''; continue; }
    if (command === 'C' && ring) { const from = ring.at(-1); flattenCubic(from, point(), point(), point(), ring); continue; }
    if (command === 'Z') { ring = null; command = ''; continue; }
    throw new Error(`unsupported path data near token ${i}: ${tokens[i]}`);
  }
  return result.map(points => {
    const first = points[0], last = points.at(-1);
    return Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6 ? points.slice(0, -1) : points;
  });
}

function simplifyChain(points, tolerance) {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points.at(-1)];
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  let worst = -1, at = 0;
  for (let k = 1; k < points.length - 1; k++) {
    const p = points[k];
    const distance = length < 1e-9 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / length;
    if (distance > worst) { worst = distance; at = k; }
  }
  if (worst <= tolerance) return [a, b];
  return [...simplifyChain(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplifyChain(points.slice(at), tolerance)];
}

/** Ramer-Douglas-Peucker on a closed ring, split at the point farthest from the first one. */
export function simplifyRing(points, tolerance) {
  let far = 0, best = -1;
  points.forEach((p, k) => { const d = Math.hypot(p[0] - points[0][0], p[1] - points[0][1]); if (d > best) { best = d; far = k; } });
  const first = simplifyChain(points.slice(0, far + 1), tolerance);
  const second = simplifyChain([...points.slice(far), points[0]], tolerance);
  const merged = [...first.slice(0, -1), ...second.slice(0, -1)].map(([x, y]) => [round1(x), round1(y)]);
  return merged.filter((p, k) => k === 0 || p[0] !== merged[k - 1][0] || p[1] !== merged[k - 1][1]);
}

export function bounds(all) {
  const xs = all.flat().map(p => p[0]), ys = all.flat().map(p => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** The emblem's rings in logo units: six wing feathers (logo order) and the helmet's four pieces. */
export function pickEmblemRings(logoSvg, tolerance = TOLERANCE) {
  const paths = parsePaths(logoSvg);
  if (paths.length !== 19) throw new Error(`gladiator-logo.svg has ${paths.length} paths, expected 19`);
  const pick = numbers => numbers.flatMap(n => rings(paths[n - 1]).map(ring => simplifyRing(ring, tolerance)));
  return { wings: pick(WING_PATHS), helmet: pick(HELMET_PATHS) };
}
