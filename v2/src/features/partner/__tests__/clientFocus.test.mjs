// Run with npm run test:unit. Keyboard focus in the Client Area is drawn square, like everything else in it.
// Why (phase 5 review): the global :focus-visible adds border-radius 2px, and with the bar's 4px offset
// the Close button's focus ring came out with ~6px rounded corners on a page with no rounded shapes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../arena-page/arenaPage.css', import.meta.url), 'utf8');

test('every focus ring inside the Client Area has square corners', () => {
  const rule = /\.partner\s+:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1];
  assert.ok(rule, 'partner.css styles .partner :focus-visible');
  assert.match(rule, /border-radius:\s*0\b/);
});
