// Run with npm run test:unit. The ring's small text lines get their own shade; the copy block does not.
// Why (Phase 4 M4 review): a shade behind the whole copy block spread as wide as the huge title, so on
// desktop it ran across the centre card and dimmed the lower third of the current cover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../hall.css', import.meta.url), 'utf8');
const rule = selector => new RegExp(`(^|[},\\s])${selector.replace(/[.:]/g, m => `\\${m}`)}\\s*[,{]`, 'm').test(css);

test('only the eyebrow and data lines carry a shade, sized to their text', () => {
  assert.equal(rule('.hall-copy__game::before'), false, 'the copy block must not carry a shade');
  for (const line of ['.hall-meta', '.hall-facts']) {
    assert.ok(rule(`${line}::before`), `${line} has its own shade`);
  }
  const lines = /\.hall-meta,\s*\.hall-facts\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(lines, /width:\s*fit-content/, 'the shade follows the text width, not the column');
});
