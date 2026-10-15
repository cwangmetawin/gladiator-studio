import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLoader } from './loadTs.mjs';
let css = readFileSync(new URL('../../features/arena-page/arenaPage.css', import.meta.url), 'utf8');
if (process.env.MUTATE_EDITORIAL_HEADLINE_SIGNAL === '1') css = css.replace(/\.arena-page\[data-flight='settled'\] \.partner__title \.editorial-word \{ animation: editorial-word-in[^}]+\}/, '');
const { pageFlightTiming } = await createLoader().load('features/arena/pageFlight.ts');
test('headline words start from the settled signal within the unchanged flight budget', () => {
  const rule = css.match(/\.arena-page\[data-flight='settled'\] \.partner__title \.editorial-word \{ animation: editorial-word-in (\d+)ms[^}]+min\(var\(--word-delay,0ms\),(\d+)ms\)/);
  assert.equal(Boolean(rule), true, 'landing must own word animation, so a later observer cannot restart it');
  assert.ok(pageFlightTiming(false, false).durationMs + Number(rule[1]) + Number(rule[2]) <= 1500);
  assert.ok(pageFlightTiming(true, false).durationMs + Number(rule[1]) + Number(rule[2]) <= 1200);
});
test('the complete hero shade retains contrast through the far edge of long headings', () => {
  const shade = css.match(/\.partner__hero::before \{([^}]+)\}/)?.[1] ?? '';
  assert.doesNotMatch(shade, /transparent/);
  assert.match(shade, /rgba\(5,6,9,0\.86\)/);
});
test('nested editorial copy and the timeline end marker have visible progressive treatments', () => {
  assert.match(css, /\.editorial-timeline__end \{[^}]*width: 1px; height: 1px/);
  assert.match(css, /data-editorial-state='visible'[^\n]*editorial-dossier__copy, \.partner__document/);
  assert.match(css, /\.partner__stage \.editorial-chapter__kicker \{[^}]*font: var\(--page-meta-size\)/);
});
