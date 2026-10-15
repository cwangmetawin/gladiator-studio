// Run with npm run test:unit. On a portrait phone the emblem stays inside the page's side padding.
// Why (Phase 4 M1 review): at --emblem-fraction 1.14 the emblem was 407 px wide on a 390 px phone, so
// both wing tips were cut, and the idle sway made it lopsided (one tip on the edge, the other a few px
// in). At 1.0 it is as wide as the content column (16 px padding each side), which leaves room for
// the sway's few pixels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../arenaHero.css', import.meta.url), 'utf8');

test('a portrait phone never makes the emblem wider than the content column', () => {
  const phone = /@media \(max-width: 767px\) and \(orientation: portrait\) \{([\s\S]*?)\n\}/.exec(css)?.[1];
  assert.ok(phone, 'the portrait-phone block exists');
  const fraction = Number(/--emblem-fraction:\s*([\d.]+)/.exec(phone)?.[1]);
  assert.ok(Number.isFinite(fraction), 'the portrait-phone block sets --emblem-fraction');
  assert.ok(fraction <= 1, `--emblem-fraction ${fraction} on phones: the wing tips would leave the screen`);
});
