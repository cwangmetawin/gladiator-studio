// Run with npm run test:unit. Phase 4 M0: the age gate dissolves into the warp intro with no
// near-black frame (measured by handoff-probe + luma.py: the old intro sat at mean luma ~0.1-4
// for 1.2 s). Two things make that true, and this file pins both:
//  1. the intro paints the same deep-space sky as the gate behind its canvas (BRAND_SKY), not #000;
//  2. its star trails fade to transparent (destination-out) instead of being painted over in black.
// MUTATE_WARP_BLACK=1 puts the black fill back (red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from './sourceModule.mjs';
import { sceneLoadingModuleUrls } from './sceneLoadingModuleUrls.mjs';
import { createClock, createHarness, findAll, harnessHooksUrl } from './hookHarness.mjs';

const urls = sceneLoadingModuleUrls(moduleUrl, source);
let warpSource = source('../components/WarpIntro.tsx');
if (process.env.MUTATE_WARP_BLACK === '1') {
  const target = "ctx.globalCompositeOperation = 'destination-out';";
  assert.ok(warpSource.includes(target), 'black-fill mutation target not found');
  warpSource = warpSource.replace(target, "ctx.globalCompositeOperation = 'source-over';");
}
const { WarpIntro } = await import(moduleUrl(warpSource
  .replaceAll("from 'react'", `from '${harnessHooksUrl(moduleUrl)}'`)
  .replace("from '@/features/starfield/sceneReadiness'", `from '${urls.readiness}'`)
  .replace("from '@/shared/utils/frameTime'", `from '${moduleUrl(source('../utils/frameTime.ts'))}'`)
  .replace("from '@/shared/utils/renderResolution'", `from '${moduleUrl(source('../utils/renderResolution.ts'))}'`)
  .replace("from '@/shared/brand/brandSky'", `from '${moduleUrl(source('../brand/brandSky.ts'))}'`)
  .replace("from '@/shared/motion/introTiming'", `from '${urls.intro}'`)));

function fakeCanvas(log) {
  let composite = 'source-over';
  const context = {
    get globalCompositeOperation() { return composite; },
    set globalCompositeOperation(value) { composite = value; log.push({ op: 'composite', value }); },
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt',
    setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { log.push({ op: 'stroke', composite }); },
    fillRect(x, y, width, height) { log.push({ op: 'fillRect', composite, fill: context.fillStyle, covers: [x, y, width, height] }); },
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return { width: 0, height: 0, style: {}, getContext: () => context };
}

test('the warp intro paints the gate\'s sky behind its stars and fades its trails to transparent, never to black', () => {
  const previous = Object.fromEntries(['window', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
  const clock = createClock();
  let frame = null;
  const query = { matches: false, addEventListener() {}, removeEventListener() {} };
  globalThis.performance = { now: () => 0 };
  globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = {
    matchMedia: () => query, devicePixelRatio: 1, innerWidth: 1000, innerHeight: 800,
    addEventListener() {}, removeEventListener() {},
    setTimeout: (...args) => clock.setTimeout(...args), clearTimeout: (...args) => clock.clearTimeout(...args),
  };
  const log = [];
  const harness = createHarness(WarpIntro, { attach: type => (type === 'canvas' ? fakeCanvas(log) : null) });
  try {
    harness.mount({ onComplete() {} });
    const container = findAll(harness.output, el => el.props?.['data-warp-intro'] !== undefined)[0];
    assert.ok(container, 'the warp container renders');
    const { style } = container.props;
    assert.notEqual(String(style.backgroundColor).toLowerCase(), '#000000', 'no black behind the stars');
    assert.match(style.backgroundImage, /url\(\/nebula\.webp\)/, 'the same nebula sky as the gate');
    assert.ok(frame, 'the intro animates');
    frame(16);
    const fades = log.filter(entry => entry.op === 'fillRect');
    assert.ok(fades.length >= 1, 'the trail fade is drawn');
    assert.deepEqual(log.find(entry => entry.op === 'composite'), { op: 'composite', value: 'destination-out' }, 'the trail fade erases');
    assert.equal(fades[0].composite, 'destination-out', 'the fade erases towards the sky behind the canvas');
    assert.deepEqual(fades[0].covers, [0, 0, 1000, 800], 'over the whole canvas');
    assert.equal(log.filter(entry => entry.op === 'composite').at(-1).value, 'source-over', 'stars are painted normally');
    const firstStroke = log.findIndex(entry => entry.op === 'stroke');
    assert.ok(firstStroke > log.findIndex(entry => entry.op === 'composite' && entry.value === 'source-over'), 'stars are drawn after the mode is restored');
    for (const entry of fades.filter(fill => fill.composite === 'source-over')) {
      assert.doesNotMatch(entry.fill, /^rgba\(0, 0, 0, (?:1|0?\.[5-9]\d*)\)$|^#0{3,6}$/, 'no near-opaque black painted over the sky');
    }
  } finally {
    harness.unmount();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
