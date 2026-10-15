import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLoader } from './loadTs.mjs';

const css = readFileSync(new URL('../../features/arena-page/arenaPage.css', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../design/theme.css', import.meta.url), 'utf8');
const token = (text, name) => {
  const hex = text.match(new RegExp(`--${name}:\\s*#([\\da-f]{6})`, 'i'))?.[1];
  assert.ok(hex, `${name} is a solid tested copy token`);
  return hex.match(/../g).map(value => parseInt(value, 16));
};
const liveShade = css.match(/\.arena-page\[data-scene='live'\] \.partner__shade\s*\{([^}]+)\}/)?.[1] ?? '';
const blend = (front, back, alpha) => front.map((v, i) => v * alpha + back[i] * (1 - alpha));
const luminance = rgb => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (luminance(a) + 0.05) / (luminance(b) + 0.05);

test('the landed shade is bounded to the text column, leaving most of the viewport untouched', () => {
  const width = Number(liveShade.match(/width:\s*min\(([\d.]+)%/)?.[1] ?? 100) / 100;
  const height = Number(liveShade.match(/height:\s*([\d.]+)%/)?.[1] ?? 100) / 100;
  // Its unmasked rectangle occupies < 42%; local copy scrims protect every text edge.
  assert.ok(width * height <= 0.42, `shade rectangle covers ${(width * height * 100).toFixed(1)}% of viewport`);
  assert.doesNotMatch(liveShade, /mask-image:\s*radial-gradient/);
  assert.match(css, /--page-copy-shade:\s*rgba\(5, 6, 9, 0\.8[4-9]\)/);
  assert.match(css, /:is\(p, h2, h3\)[^{]*\{[^}]*background:\s*var\(--page-copy-shade\)/s);
});

test('local scrims also protect feed values, direct contact channels and form feedback', () => {
  for (const selector of ['.arena-page__feed li > :is(span, strong)', '.arena-page__row > :is(a, span)',
    '.arena-page__contact-form > [aria-live=\'polite\']', '.field-error', '.readout']) {
    const index = css.indexOf(selector), block = index < 0 ? '' : css.slice(index, css.indexOf('}', index));
    assert.ok(block.includes('background: var(--page-copy-shade)'), `${selector} needs its own text scrim`);
  }
});

test('body and muted copy pass on a rendered lit-sand composition, including a bright arena edge', async () => {
  const { sampleArenaFloor } = await createLoader().load('features/arena/arenaLighting.ts');
  const alpha = Number(css.match(/--page-copy-shade:\s*rgba\(5, 6, 9, ([\d.]+)\)/)?.[1] ?? 0);
  const foregrounds = [token(theme, 'color-ice-50'), token(theme, 'color-ice-200'),
    token(css, 'color-ice-400'), token(theme, 'color-ember')], pixels = [];
  // A CPU raster of the same procedural floor and lighting parameters used by FLOOR_FRAGMENT.
  for (let y = 0; y < 128; y++) for (let x = 0; x < 192; x++) {
    const rgb = sampleArenaFloor((x / 191 - 0.5) * 48, (y / 127 - 0.5) * 48, 2.4);
    pixels.push(rgb.map(v => Math.min(255, Math.max(0, v * 255))));
  }
  assert.ok(pixels.some(rgb => luminance(rgb) > 0.08), 'stand-in includes genuinely illuminated arena pixels');
  let minimum = Infinity;
  for (const pixel of pixels) for (const text of foregrounds) {
    minimum = Math.min(minimum, contrast(text, blend([5, 6, 9], pixel, alpha)));
  }
  assert.ok(minimum >= 4.5, `composed body contrast is ${minimum.toFixed(2)}:1`);
  // Retain the previous white-background guarantee in addition to the real lighting composition.
  for (const text of foregrounds) assert.ok(contrast(text, blend([5, 6, 9], [255, 255, 255], alpha)) >= 4.5);
  console.log(`lit-arena raster: ${pixels.length} pixels; minimum copy contrast ${minimum.toFixed(2)}:1`);
});
