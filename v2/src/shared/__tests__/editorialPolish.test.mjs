import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLoader } from './loadTs.mjs';
import { colourChannels, compositeShade, contrastRatio, cssRules, shadeAlpha } from './editorialCssGuard.mjs';
const source = file => readFileSync(new URL(`../../features/arena-page/${file}`, import.meta.url), 'utf8');
let shellCss = source('arenaPage.css');
if (process.env.MUTATE_EDITORIAL_HEADLINE_SIGNAL === '1') shellCss = shellCss.replace(/\.arena-page\[data-flight='settled'\] \.partner__title \.editorial-word \{ animation: editorial-word-in[^}]+\}/, '');
const css = `${shellCss}\n${source('editorialBody.css')}`;
const { pageFlightTiming } = await createLoader().load('features/arena/pageFlight.ts');
test('headline words start from the settled signal within the unchanged flight budget', () => {
  const rule = shellCss.match(/\.arena-page\[data-flight='settled'\] \.partner__title \.editorial-word \{ animation: editorial-word-in (\d+)ms[^}]+min\(var\(--word-delay,0ms\),(\d+)ms\)/);
  assert.equal(Boolean(rule), true, 'landing must own word animation, so a later observer cannot restart it');
  assert.ok(pageFlightTiming(false, false).durationMs + Number(rule[1]) + Number(rule[2]) <= 1500);
  assert.ok(pageFlightTiming(true, false).durationMs + Number(rule[1]) + Number(rule[2]) <= 1200);
});
test('one shared backing plane covers the hero and page body without an overlapping hero shade', () => {
  const planes = cssRules(css).filter(({ selectors, declarations }) =>
    selectors === '.partner__body::before' && /background:\s*var\(--page-body-shade\)/.test(declarations));
  assert.equal(planes.length, 1, 'the shared page wrapper owns one backing plane');
  assert.equal(/\.partner__hero::before\s*\{/.test(css), false, 'a second hero plane would overlap the body feather');
  const alpha = shadeAlpha(css);
  assert.equal(alpha, 0.84, 'hero and body use the same auditable opacity');
  assert.ok(contrastRatio(colourChannels('f2f7fc'), compositeShade([255, 255, 255], alpha)) >= 7,
    'the long hero heading remains above 7:1 even over a white arena pixel');
  for (const file of ['features/arena-page/ArenaPageContent.tsx', 'features/partner/PartnerPage.tsx', 'features/partner/PartnerPending.tsx']) {
    const markup = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.equal(/<main className="partner__stage">\s*<div className="partner__body">\s*<section className=/.test(markup), true,
      `${file}: the hero must begin inside the same body wrapper`);
    assert.equal([...markup.matchAll(/className="partner__body"/g)].length, 1, `${file}: only one shared wrapper`);
  }
});
test('nested editorial copy and the timeline end marker have visible progressive treatments', () => {
  assert.match(css, /\.editorial-timeline__end \{[^}]*width: 1px; height: 1px/);
  assert.match(css, /data-editorial-state='visible'[^\n]*editorial-dossier__copy, \.partner__document/);
  assert.match(css, /\.partner__stage \.editorial-chapter__kicker \{[^}]*font: var\(--page-meta-size\)/);
});
