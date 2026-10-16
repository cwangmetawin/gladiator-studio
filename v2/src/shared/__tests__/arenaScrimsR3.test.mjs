import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLoader } from './loadTs.mjs';
import { bodyBackdropCoverage, bodyBleedShadeSelectors, colourChannels as rgb, compositeShade, contrastRatio, cssRules, editorialCss, shadeAlpha } from './editorialCssGuard.mjs';

const css = editorialCss();
const theme = readFileSync(new URL('../design/theme.css', import.meta.url), 'utf8');
const definitions = `${theme}\n${css}`;
const token = name => rgb([...definitions.matchAll(new RegExp(`--${name}:\\s*#([\\da-f]{6})`, 'gi'))].at(-1)?.[1] ?? '000000');

const bodyBackdrop = () => cssRules(css).find(({ selectors, declarations }) => /\.partner__body::before\b/.test(selectors) && /\bbackground\s*:/.test(declarations));

test('one continuous body backdrop feathers only its own layer and stays behind every chapter', () => {
  const backdrop = bodyBackdrop();
  assert.ok(backdrop, 'the full body owns its shared backdrop');
  assert.match(backdrop.declarations, /background:\s*var\(--page-body-shade\)/);
  assert.match(backdrop.declarations, /mask-image:\s*linear-gradient\(90deg,\s*transparent,\s*#000 var\(--page-body-feather-x\),\s*#000 calc\(100% - var\(--page-body-feather-x\)\),\s*transparent\),\s*linear-gradient\(180deg,\s*transparent,\s*#000 var\(--page-body-feather-top\)\)/, 'coverage calculation follows these actual linear stops');
  assert.match(backdrop.declarations, /mask-composite:\s*intersect/);
  assert.match(backdrop.declarations, /pointer-events:\s*none/);
  assert.match(backdrop.declarations, /z-index:\s*-1/);
  assert.doesNotMatch(backdrop.declarations, /\bfilter\s*:/, 'the continuous backdrop does not blur or mask any text');
  assert.match(backdrop.declarations, /(?:inset-block|inset-block-start|top):\s*calc\(-1\s*\*\s*var\(--page-body-feather-top\)\)/);
  assert.equal(bodyBleedShadeSelectors(css).length, 0, 'later reveal contexts cannot paint a shade across earlier copy');
  assert.match(css, /\.arena-page__dots li::before\s*\{\s*content: '·'/, 'the dot keeps its existing pseudo-element');
});

test('the text region is inside the body feather plateau at desktop and phone widths', () => {
  const horizontal = Number(css.match(/--page-body-feather-x:\s*([\d.]+)%/)?.[1]);
  const vertical = Number(css.match(/--page-body-feather-top:\s*([\d.]+)px/)?.[1]);
  assert.ok(horizontal >= 10 && horizontal <= 16, 'side feather occupies 10–16% of the backdrop plane');
  assert.equal(vertical, 140, 'top feather dissolves over 140px before the first text');
  for (const width of [320, 390, 767, 1024, 1440, 1920, 2560, 3840, 5120]) {
    const pad = Math.max(16, Math.min(64, width * 0.042));
    for (const x of [pad, width - pad, width / 2]) {
      const coverage = bodyBackdropCoverage(css, width, x, 0);
      assert.ok(coverage === 1, `${width}px: first and last text glyphs have ${coverage} mask coverage`);
    }
    assert.equal(bodyBackdropCoverage(css, width, width / 2, -vertical), 0, 'outer top edge is fully transparent');
    assert.ok(bodyBackdropCoverage(css, width, width / 2, -vertical / 2) > 0, 'top feather changes smoothly');
  }
});

test('feathered body composition keeps body and lists above 7:1 and every other token above 4.5:1 over arena and white', async () => {
  const { sampleArenaFloor } = await createLoader().load('features/arena/arenaLighting.ts');
  const foregrounds = [
    ['body/list', token('color-ice-100'), 7], ['primary', token('color-ice-50'), 4.5],
    ['metadata', token('color-ice-200'), 4.5], ['legacy muted', token('color-ice-400'), 4.5],
    ['error', token('color-ember'), 4.5],
  ];
  const base = shadeAlpha(css), pad2560 = 64;
  const coverage = Math.min(1, ...[320, 390, 1440, 2560].flatMap(width => {
    const pad = width === 2560 ? pad2560 : Math.max(16, Math.min(64, width * 0.042));
    return [pad, width - pad].map(x => bodyBackdropCoverage(css, width, x, 0));
  }));
  assert.ok(Number.isFinite(base * coverage), 'contrast uses the new body alpha and the source mask geometry');
  const minimum = new Map(foregrounds.map(([name]) => [name, Infinity]));
  const check = pixel => {
    const background = compositeShade(pixel, base * coverage);
    for (const [name, colour] of foregrounds) minimum.set(name, Math.min(minimum.get(name), contrastRatio(colour, background)));
  };
  for (let y = 0; y < 128; y++) for (let x = 0; x < 192; x++) {
    check(sampleArenaFloor((x / 191 - 0.5) * 48, (y / 127 - 0.5) * 48, 2.4).map(v => Math.max(0, Math.min(255, v * 255))));
  }
  check([255, 255, 255]); // Preserve round 1's worst case, beyond even a fully lit arena edge.
  for (const [name, , required] of foregrounds) assert.ok(minimum.get(name) >= required, `${name}: ${minimum.get(name).toFixed(2)}:1 at feathered glyph edges`);
  console.log(`body composition: alpha ${base}; minimum glyph coverage ${coverage.toFixed(4)}; ${[...minimum].map(([name, value]) => `${name} ${value.toFixed(2)}:1`).join(', ')}`);
});

test('the hero shares the protected page plateau without a second backing layer or overlap seam', () => {
  assert.equal(cssRules(css).some(({ selectors, declarations }) => /\.partner__hero::before\b/.test(selectors) && /\bbackground\s*:/.test(declarations)), false, 'hero must not double-layer the top 140px of the body backdrop');
  const coverage = bodyBackdropCoverage(css, 1440, 1440 * 0.042, 0);
  const background = compositeShade([255, 255, 255], shadeAlpha(css) * coverage);
  for (const [name, minimum] of [['color-ice-50', 4.5], ['color-ice-100', 7], ['color-ice-200', 4.5], ['color-ember', 4.5]]) {
    assert.ok(contrastRatio(token(name), background) >= minimum, `${name} preserves the hero white-background proof on the shared plane`);
  }
  assert.equal(cssRules(css).some(({ declarations }) => /var\(--page-copy-bleed\)/.test(declarations)), false, 'hero and body no longer need overlapping element shadows');
});
