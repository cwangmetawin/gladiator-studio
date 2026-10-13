// Run with npm run test:unit. Guards the owner's design rule (2026-10-13): no coloured side
// stripe on a card or list item, the "AI design" look ("左边一个彩色的边"). Mark state with
// the eyebrow dot, a hairline or colour instead. Hairline dividers and HUD corner brackets
// (1px left edges) are allowed.
// MUTATE_SIDE_STRIPE=1 adds a stripe back to the constellation door (red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
