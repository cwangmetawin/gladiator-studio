// Run with npm run test:unit. Guards the owner's design rule (2026-10-13): no coloured side
// stripe on a card or list item, the "AI design" look ("左边一个彩色的边"). Mark state with
// the eyebrow dot, a hairline or colour instead. Hairline dividers and HUD corner brackets
// (1px left edges) are allowed.
// MUTATE_SIDE_STRIPE=1 adds a stripe back to the constellation door (red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const STYLED = /\.(css|tsx|ts)$/;

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(path);
    return STYLED.test(entry.name) ? [path] : [];
  });
}

// A left (or inline-start) edge of 2px or more, a left edge recoloured on its own, or the
// Tailwind equivalents. Each one draws a stripe down one side of a box.
const SIDE_STRIPE = [
  /border-(?:left|inline-start)\s*:\s*(?:[2-9]|\d{2,})(?:\.\d+)?px/,
  /border-(?:left|inline-start)-(?:color|width)\s*:/,
  /borderLeft\s*:\s*['"`](?:[2-9]|\d{2,})(?:\.\d+)?px/,
  /borderLeft(?:Color|Width)\s*:/,
  /\bborder-l-(?:[2-9]|\[)/,
  /\bborder-s-(?:[2-9]|\[)/,
];

function sideStripes(files) {
  const found = [];
  for (const { path, text } of files) {
    text.split('\n').forEach((line, index) => {
      if (SIDE_STRIPE.some(pattern => pattern.test(line))) found.push(`${path}:${index + 1}: ${line.trim()}`);
    });
  }
  return found;
}

const files = sources(SRC).map(path => ({ path: relative(SRC, path), text: readFileSync(path, 'utf8') }));
if (process.env.MUTATE_SIDE_STRIPE === '1') {
  const door = files.find(file => file.path.endsWith('constellations.css'));
  assert.ok(door, 'side-stripe mutation target not found');
  door.text += '\n.constellation { border-left: 2px solid var(--constellation-accent); }\n';
}
if (process.env.MUTATE_CLIENT_RADIUS === '1') {
  files.find(file => file.path === 'features/partner/partner.css').text += '\n.partner__faq article { border-radius: 8px; }\n';
}

test('no coloured side stripes on cards or list items', () => {
  assert.deepEqual(sideStripes(files), []);
});

test('the stripe check catches each form and allows hairlines and brackets', () => {
  const bad = [
    'border-left: 2px solid var(--accent);',
    'border-inline-start: 3px solid red;',
    'border-left-color: var(--color-holo-500);',
    "borderLeft: '4px solid #fff'",
    'borderLeftColor: accent',
    '<div className="border-l-4 border-sky-500">',
    '<div className="border-l-[3px]">',
  ];
  bad.forEach(line => assert.equal(sideStripes([{ path: 'x', text: line }]).length, 1, line));
  const fine = [
    'border-left: 1px solid var(--color-holo-500);',
    "borderLeft: isLeft ? 'none' : '1px solid var(--color-line)'",
    'style={{ borderTop: b, borderLeft: b }}',
    '<div className="border-l border-white/10">',
  ];
  fine.forEach(line => assert.deepEqual(sideStripes([{ path: 'x', text: line }]), [], line));
});

test('Client Area cannot regain the Earth, warp, telemetry, sci-fi chrome or card primitives', () => {
  for (const name of ['PartnerEarth.tsx', 'WarpTransition.tsx']) {
    assert.equal(existsSync(join(SRC, 'features/partner', name)), false, name);
  }
  const partner = files.filter(file => file.path.startsWith('features/partner/'));
  assert.ok(partner.length > 0);
  for (const file of partner) {
    assert.doesNotMatch(file.text, /PartnerEarth|WarpTransition|PARTNER UPLINK|DISENGAGE|STEP_|telemetry|warpStart/i, file.path);
    assert.doesNotMatch(file.text, /<canvas|@babylonjs|requestAnimationFrame|className=["'][^"']*\b(?:card|glass|btn)\b|\b(?:Check|ShieldCheck)\b/, file.path);
  }
  assert.doesNotMatch(files.find(file => file.path === 'app/App.tsx').text, /WarpTransition|createWarpSounds|arriveClientArea|'transitioning'/);
});

function roundedBlocks(text) {
  const css = /border(?:-(?:top-left|top-right|bottom-left|bottom-right|start-start|start-end|end-start|end-end))?-radius\s*:\s*([^;}\n]+)/g;
  const inline = /border(?:TopLeft|TopRight|BottomLeft|BottomRight|StartStart|StartEnd|EndStart|EndEnd)?Radius\s*:\s*([^;}\n]+)/g;
  return [...[...text.matchAll(css), ...text.matchAll(inline)].map(match => match[1].trim().replace(/["',]/g, '')),
    ...[...text.matchAll(/\brounded(?:-[^\s"'<>}]*)?/g)].map(match => match[0]).filter(value => value !== 'rounded-none')]
    .filter(value => !/^(?:0(?:px)?|[123](?:\.\d+)?px)$/.test(value));
}

test('Client Area has square blocks, including the shared sound button and ticker covers', () => {
  const partner = files.filter(file => file.path.startsWith('features/partner/'));
  for (const file of partner) assert.deepEqual(roundedBlocks(file.text), [], file.path);
  const css = files.find(file => file.path.endsWith('arena-page/arenaPage.css')).text;
  assert.match(css, /\.partner \.icon-btn[^}]*border-radius:\s*0/s);
  assert.match(css, /\.partner \.ticker__thumb[^}]*border-radius:\s*0/s);
  for (const bad of ['border-radius: 4px;', 'borderRadius: 8,', 'border-radius: var(--radius-sm);', 'border-radius: 50%;']) {
    assert.equal(roundedBlocks(bad).length, 1, bad);
  }
});

test('the Client Area radius guard catches corner-only rules and utility classes as well as shorthand', () => {
  for (const bad of ['border-top-left-radius: 8px;', 'border-start-end-radius: 4px;',
    'borderTopLeftRadius: 4,', 'borderStartEndRadius: "8px",', 'className="rounded-lg"', 'className="rounded-[4px]"']) {
    assert.equal(roundedBlocks(bad).length, 1, bad);
  }
  for (const fine of ['border-radius: 0;', 'border-top-left-radius: 2px;', 'borderRadius: 0,', 'className="rounded-none"']) {
    assert.deepEqual(roundedBlocks(fine), [], fine);
  }
});

test('Client Area uses the arena title scale, a static backdrop and bounded instant reduced motion', () => {
  const css = files.find(file => file.path === 'features/arena-page/arenaPage.css').text;
  assert.match(css, /\.partner__title\s*\{[^}]*font-family:\s*'Saira Title'/s);
  assert.match(css, /font-size:\s*clamp\(96px,/);
  assert.match(css, /font-size:\s*clamp\(44px,/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[^]*animation:\s*none/);
  assert.doesNotMatch(css, /animation[^;]*\b(?:infinite|[1-9]\d{3}ms|[1-9]s)\b/);
  const area = files.find(file => file.path === 'features/arena-page/ArenaPageShell.tsx')?.text ?? '';
  for (const pattern of [/role="dialog"/, /aria-modal="true"/, /aria-labelledby=\{titleId\}/, /useDialogFocus/, /onEscape: onClose/, /returnFocusRef/, /client-backdrop\.svg/]) assert.match(area, pattern);
});

test('all seven arena pages and their shell keep square blocks and use editorial primitives', () => {
  const pagePaths = ['features/arena-page/', 'features/about/', 'features/team/', 'features/journey/', 'features/careers/', 'features/contact/', 'features/games/', 'features/live-feed/LiveActivityFeed.tsx'];
  for (const file of files.filter(file => pagePaths.some(prefix => file.path.startsWith(prefix)))) {
    assert.deepEqual(roundedBlocks(file.text), [], file.path);
    assert.doesNotMatch(file.text, /className=["'][^"']*\b(?:card|glass|btn)\b/, file.path);
  }
});
