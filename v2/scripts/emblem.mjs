// Derives the gate emblem (helmet and wings) and the site icon (helmet only) from the brand
// logo, so neither drifts from public/gladiator-logo.svg.
//   node scripts/emblem.mjs          rewrites src/shared/brand/emblemPaths.ts and public/favicon.svg
//   node scripts/emblem.mjs --check  exits 1 when either file is stale
// The logo's paths are absolute M/C/Z outlines from an auto-trace. Each is flattened, simplified
// within TOLERANCE logo units (0.1 units is ~0.3 device px with the emblem 1,000 px wide at DPR 3)
// and written with one decimal: about 2.2 KB instead of the 16 KB trace.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** 1-based path numbers in gladiator-logo.svg: the six wing feathers and the four helmet pieces. */
export const WING_PATHS = [8, 9, 11, 12, 13, 14];
export const HELMET_PATHS = [16, 17, 18, 19];
export const TOLERANCE = 0.1;

const round1 = value => Math.round(value * 10) / 10;
const num = value => {
  const text = String(round1(value) === 0 ? 0 : round1(value));
  return text.replace(/^(-?)0\./, '$1.');
};

function parsePaths(svg) {
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
function rings({ d, tx, ty }) {
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
function simplifyRing(points, tolerance) {
  let far = 0, best = -1;
  points.forEach((p, k) => { const d = Math.hypot(p[0] - points[0][0], p[1] - points[0][1]); if (d > best) { best = d; far = k; } });
  const first = simplifyChain(points.slice(0, far + 1), tolerance);
  const second = simplifyChain([...points.slice(far), points[0]], tolerance);
  const merged = [...first.slice(0, -1), ...second.slice(0, -1)].map(([x, y]) => [round1(x), round1(y)]);
  return merged.filter((p, k) => k === 0 || p[0] !== merged[k - 1][0] || p[1] !== merged[k - 1][1]);
}

function ringPath(points, origin) {
  const [x0, y0] = points[0];
  let text = `M${num(x0 - origin[0])} ${num(y0 - origin[1])}l`;
  for (let k = 1; k < points.length; k++) {
    const dx = num(points[k][0] - points[k - 1][0]), dy = num(points[k][1] - points[k - 1][1]);
    text += `${k === 1 || dx.startsWith('-') ? '' : ' '}${dx}${dy.startsWith('-') ? '' : ' '}${dy}`;
  }
  return `${text}z`;
}

function bounds(all) {
  const xs = all.flat().map(p => p[0]), ys = all.flat().map(p => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** The longest straight run along a feather's top (within 1.5 units of its highest point): the
 *  line the arcs race along. The two low feathers' tops tilt by about 1 unit over 240. */
function topEdge(ring) {
  const top = Math.min(...ring.map(p => p[1]));
  let best = null;
  ring.forEach((a, k) => {
    const b = ring[(k + 1) % ring.length];
    if (a[1] - top > 1.5 || b[1] - top > 1.5) return;
    const length = Math.abs(b[0] - a[0]);
    if (!best || length > best.length) best = { length, left: a[0] < b[0] ? a : b, right: a[0] < b[0] ? b : a };
  });
  return best;
}

/** Pure: everything both outputs need, from the logo's text. */
export function buildEmblem(logoSvg, tolerance = TOLERANCE) {
  const paths = parsePaths(logoSvg);
  if (paths.length !== 19) throw new Error(`gladiator-logo.svg has ${paths.length} paths, expected 19`);
  const pick = numbers => numbers.flatMap(n => rings(paths[n - 1]).map(ring => simplifyRing(ring, tolerance)));
  const wings = pick(WING_PATHS), helmet = pick(HELMET_PATHS);
  const box = bounds([...wings, ...helmet]);
  // The emblem's own coordinates: origin at its top-left corner, 1 logo unit = 1 unit.
  const origin = [Math.floor(box.minX), Math.floor(box.minY)];
  const width = Math.ceil(box.maxX) - origin[0], height = Math.ceil(box.maxY) - origin[1];
  const helmetBox = bounds(helmet);
  return {
    width, height,
    wings: wings.map(ring => ringPath(ring, origin)),
    helmet: helmet.map(ring => ringPath(ring, origin)),
    helmetBox: { x: round1(helmetBox.minX - origin[0]), y: round1(helmetBox.minY - origin[1]),
      width: round1(helmetBox.maxX - helmetBox.minX), height: round1(helmetBox.maxY - helmetBox.minY) },
    featherEdges: wings.map(ring => {
      const { left, right } = topEdge(ring);
      return { x0: round1(left[0] - origin[0]), y0: round1(left[1] - origin[1]),
        x1: round1(right[0] - origin[0]), y1: round1(right[1] - origin[1]) };
    }),
  };
}

/** The site icon: the helmet alone, ice-white on a void tile so it reads on light and dark tab bars.
 *  A tile-coloured stroke widens the gaps between the helmet's four pieces to about 1 px at 16 px. */
export function buildFavicon(emblem) {
  const { x, y, width, height } = emblem.helmetBox;
  const pad = 0.08 * height, side = height + 2 * pad;
  const left = x + width / 2 - side / 2, top = y - pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(left)} ${num(top)} ${num(side)} ${num(side)}">`
    + `<rect x="${num(left)}" y="${num(top)}" width="${num(side)}" height="${num(side)}" rx="${num(side * 0.18)}" fill="#0A0B12"/>`
    + `<path fill="#F2F7FC" stroke="#0A0B12" stroke-width="8" stroke-linejoin="round" d="${emblem.helmet.join('')}"/></svg>\n`;
}

const literal = value => JSON.stringify(value).replace(/"(\w+)":/g, '$1: ').replace(/,(?=\S)/g, ', ');

export function emblemModule(emblem) {
  const { width, height, wings, helmet, helmetBox, featherEdges } = emblem;
  const list = items => `[\n${items.map(item => `  '${item}',`).join('\n')}\n]`;
  return `// Generated by scripts/emblem.mjs from public/gladiator-logo.svg (paths ${WING_PATHS.join(', ')}: wings;
// ${HELMET_PATHS.join(', ')}: helmet). Do not edit by hand: run \`node scripts/emblem.mjs\`.
export const EMBLEM_WIDTH = ${width};
export const EMBLEM_HEIGHT = ${height};
/** One outline per feather, in logo order: right top, left top, right middle, left middle, right low, left low. */
export const EMBLEM_WINGS: readonly string[] = ${list(wings)};
/** The helmet's four pieces. */
export const EMBLEM_HELMET: readonly string[] = ${list(helmet)};
/** The helmet's box in emblem units: the spark and the M1 3D emblem anchor to it. */
export const EMBLEM_HELMET_BOX = ${literal(helmetBox)} as const;
/** Each feather's straight top edge, left end (x0, y0) to right end (x1, y1), in the order of EMBLEM_WINGS. */
export const EMBLEM_FEATHER_EDGES = [
${featherEdges.map(edge => `  ${literal(edge)},`).join('\n')}
] as const;
`;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const root = new URL('../', import.meta.url);
  const emblem = buildEmblem(readFileSync(new URL('public/gladiator-logo.svg', root), 'utf8'));
  const outputs = [
    [new URL('src/shared/brand/emblemPaths.ts', root), emblemModule(emblem)],
    [new URL('public/favicon.svg', root), buildFavicon(emblem)],
  ];
  if (process.argv.includes('--check')) {
    const stale = outputs.filter(([file, text]) => { try { return readFileSync(file, 'utf8') !== text; } catch { return true; } });
    for (const [file] of stale) console.error(`stale: ${fileURLToPath(file)}`);
    process.exit(stale.length ? 1 : 0);
  }
  for (const [file, text] of outputs) writeFileSync(file, text);
  console.log(`emblem ${emblem.width}x${emblem.height}: wings ${emblem.wings.join('').length} B, helmet ${emblem.helmet.join('').length} B`);
}
