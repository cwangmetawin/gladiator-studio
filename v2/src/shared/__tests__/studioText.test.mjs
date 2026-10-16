import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moduleUrl } from './sourceModule.mjs';
let source = readFileSync(new URL('../utils/studioText.ts', import.meta.url), 'utf8');
if (process.env.MUTATE_STUDIO_MARKETS === '1') source = source.replace("return text.replaceAll('{{markets}}', String(stats.markets));", 'return text;');
const { withStudioMarkets } = await import(moduleUrl(source));
test('market placeholders use current studio stats without rewriting historical or admin words', () => {
  assert.equal(withStudioMarkets('Live in {{markets}} markets.', { markets: 12 }), 'Live in 12 markets.');
  assert.equal(withStudioMarkets('Entered 7 markets in 2024.', { markets: 12 }), 'Entered 7 markets in 2024.');
  assert.equal(withStudioMarkets('London — {{markets}} / {{markets}}', { markets: 0 }), 'London — 0 / 0');
});
