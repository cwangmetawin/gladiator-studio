import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLoader } from './loadTs.mjs';

const css = readFileSync(new URL('../../features/arena-page/arenaPage.css', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../design/theme.css', import.meta.url), 'utf8');
const luminance = rgb => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (text, pixel) => (luminance(text) + 0.05) / (luminance(pixel) + 0.05);
const token = (text, name) => text.match(new RegExp(`--${name}:\\s*#([\\da-f]{6})`, 'i'))[1].match(/../g).map(v => parseInt(v, 16));
const cdf = z => { // Normal CDF for CSS blur's separable Gaussian kernel.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const tail = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) * t
    * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z < 0 ? tail : 1 - tail;
};

test('every copy scrim feathers a separate backdrop, leaving text, bullets and controls unmasked', () => {
  const selectors = ['.partner__stage :is(p, h2, h3)', '.partner__stats', '.arena-page__stats', '.partner__access',
    '.arena-page__action', '.partner__foot', '.partner__dots li', '.arena-page__dots li', '.arena-page__meta',
    '.arena-page__details summary', '.field-label', '.arena-page__feed li > :is(span, strong)',
    '.arena-page__row > :is(a, span)', '.arena-page__contact-form > [aria-live=\'polite\']', '.field-error', '.readout'];
  for (const selector of selectors) {
    const at = css.indexOf(`${selector}::after`), block = at < 0 ? '' : css.slice(at, css.indexOf('}', at));
    assert.ok(block.includes('background: var(--page-copy-shade)'), `${selector} gets shade on its own pseudo-element`);
    assert.match(block, /filter:\s*blur\(var\(--page-copy-feather\)\)/);
    assert.match(block, /pointer-events:\s*none/);
    assert.match(block, /z-index:\s*-1/);
  }
  assert.doesNotMatch(css, /\.partner__stage :is\(p, h2, h3\)\s*\{[^}]*\b(?:mask-image|filter|background):/);
  assert.match(css, /\.arena-page__dots li::before\s*\{\s*content: '·'/, 'the dot keeps its existing pseudo-element');
});

test('feathered shade keeps all body tokens above 4.5:1 at glyph-box edges over the lit arena and white', async () => {
  const blur = Number(css.match(/--page-copy-feather:\s*([\d.]+)px/)?.[1] ?? 0);
  const bleed = Number(css.match(/--page-copy-bleed:\s*([\d.]+)px/)?.[1] ?? 0);
  assert.ok(blur >= 8 && bleed >= blur * 2, 'expanded soft backdrop keeps the blur outside the copy');
  assert.match(css, /inset:\s*calc\(-1 \* var\(--page-copy-bleed\)\)/);
  const base = Number(css.match(/--page-copy-shade:\s*rgba\(5, 6, 9, ([\d.]+)\)/)[1]);
  const mask = (x, y, width = 100, height = 24) =>
    (cdf((x + bleed) / blur) - cdf((x - width - bleed) / blur))
    * (cdf((y + bleed) / blur) - cdf((y - height - bleed) / blur));
  const coverage = Math.min(...[[0, 0], [100, 0], [0, 24], [100, 24], [50, 12]].map(([x, y]) => mask(x, y)));
  assert.ok(mask(-bleed - blur * 3, 12) < 0.002, 'the outer edge dissolves into the arena');
  assert.ok(mask(-bleed, 12) > mask(-bleed - blur, 12), 'edge coverage changes smoothly');
  const { sampleArenaFloor } = await createLoader().load('features/arena/arenaLighting.ts');
  const foregrounds = [token(theme, 'color-ice-50'), token(theme, 'color-ice-200'), token(css, 'color-ice-400'), token(theme, 'color-ember')];
  let minimum = Infinity;
  const check = pixel => {
    const alpha = base * coverage, background = [5, 6, 9].map((v, i) => v * alpha + pixel[i] * (1 - alpha));
    for (const text of foregrounds) minimum = Math.min(minimum, contrast(text, background));
  };
  for (let y = 0; y < 128; y++) for (let x = 0; x < 192; x++) {
    check(sampleArenaFloor((x / 191 - 0.5) * 48, (y / 127 - 0.5) * 48, 2.4).map(v => Math.max(0, Math.min(255, v * 255))));
  }
  check([255, 255, 255]);
  assert.ok(minimum >= 4.5, `minimum feathered copy contrast ${minimum.toFixed(2)}:1`);
  console.log(`feathered composition: ${blur}px Gaussian, ${bleed}px bleed; glyph-edge coverage ${coverage.toFixed(4)}; minimum ${minimum.toFixed(2)}:1`);
});
