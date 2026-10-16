import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLoader } from './loadTs.mjs';
import { colourChannels, compositeShade, contrastRatio, cssRules, editorialCss, luminance, shadeAlpha } from './editorialCssGuard.mjs';

const css = editorialCss();
const theme = readFileSync(new URL('../design/theme.css', import.meta.url), 'utf8');
const definitions = `${theme}\n${css}`;
const token = name => {
  const hex = [...definitions.matchAll(new RegExp(`--${name}:\\s*#([\\da-f]{6})`, 'gi'))].at(-1)?.[1];
  assert.ok(hex, `${name} is a solid tested copy token`);
  return colourChannels(hex);
};

test('the editorial body replaces the old static shade instead of layering another rectangle over it', () => {
  const disabled = cssRules(css).find(({ selectors, declarations }) => /\.arena-page(?:\[data-arena-page\])? \.partner__shade$/.test(selectors) && /display:\s*none/.test(declarations));
  assert.ok(disabled, 'arena editorial pages disable their old static shade');
  assert.equal(cssRules(css).filter(({ selectors, declarations }) => /\.partner__body::before$/.test(selectors) && /background:\s*var\(--page-body-shade\)/.test(declarations)).length, 1);
  assert.ok(shadeAlpha(css) >= 0.78 && shadeAlpha(css) <= 0.86, 'one translucent layer lets arena lines remain visible');
});

test('hero, feed, contact, portal and loading content all occupy the same continuous page backdrop', () => {
  for (const file of ['features/arena-page/ArenaPageContent.tsx', 'features/partner/PartnerPage.tsx', 'features/partner/PartnerPending.tsx']) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(source, /<main className="partner__stage">\s*<div className="partner__body">\s*<section className=/, `${file} puts the hero inside the shared backdrop`);
    assert.equal([...source.matchAll(/className="partner__body"/g)].length, 1, `${file} uses one wrapper for the hero and all following copy`);
  }
  for (const { selectors, declarations } of cssRules(css)) {
    if (!/\.arena-page__(?:feed|row|contact-form)|\.field-error|\.readout/.test(selectors)) continue;
    assert.doesNotMatch(declarations, /background:\s*var\(--page-copy-shade\)/, `${selectors} cannot create an overlapping local copy shade`);
  }
});

test('body and muted copy pass on a rendered lit-sand composition, including the existing white worst case', async () => {
  const { sampleArenaFloor } = await createLoader().load('features/arena/arenaLighting.ts');
  const alpha = shadeAlpha(css);
  const foregrounds = [['body/list', token('color-ice-100'), 7], ['primary', token('color-ice-50'), 4.5],
    ['meta', token('color-ice-200'), 4.5], ['legacy muted', token('color-ice-400'), 4.5], ['error', token('color-ember'), 4.5]], pixels = [];
  // A CPU raster of the same procedural floor and lighting parameters used by FLOOR_FRAGMENT.
  for (let y = 0; y < 128; y++) for (let x = 0; x < 192; x++) {
    const rgb = sampleArenaFloor((x / 191 - 0.5) * 48, (y / 127 - 0.5) * 48, 2.4);
    pixels.push(rgb.map(v => Math.min(255, Math.max(0, v * 255))));
  }
  assert.ok(pixels.some(rgb => luminance(rgb) > 0.08), 'stand-in includes illuminated arena pixels');
  let minimum = Infinity;
  for (const pixel of pixels) for (const [name, text, required] of foregrounds) {
    const actual = contrastRatio(text, compositeShade(pixel, alpha));
    minimum = Math.min(minimum, actual);
    assert.ok(actual >= required, `${name}: ${actual.toFixed(2)}:1 over rendered lighting`);
  }
  for (const [name, text, required] of foregrounds) assert.ok(contrastRatio(text, compositeShade([255, 255, 255], alpha)) >= required, `${name}: white-background guarantee`);
  console.log(`lit-arena raster: ${pixels.length} pixels; minimum copy contrast ${minimum.toFixed(2)}:1`);
});
