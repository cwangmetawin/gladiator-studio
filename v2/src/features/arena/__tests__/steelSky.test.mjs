// Run with npm run test:unit. The steel sky (Phase 4 M1): the 3D scene paints the same sky as the age gate's CSS,
// from the same constants, so the gate dissolves into the first screen without the sky changing colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const sky = await load('shared/brand/brandSky.ts');
const steel = await load('features/arena/steelSky.ts');

function fakeContext() {
  const calls = [];
  return {
    calls,
    createRadialGradient: (...args) => { calls.push(['gradient', ...args]); return { addColorStop: (at, colour) => calls.push(['stop', at, colour]) }; },
    setTransform: (...args) => calls.push(['transform', ...args]),
    clearRect: (...args) => calls.push(['clear', ...args]),
    fillRect: (...args) => calls.push(['fill', ...args]),
    set fillStyle(value) { calls.push(['style', typeof value]); },
  };
}

test('the vignette canvas is the gate\'s ellipse: the same stops, colours, centre and radii as the CSS gradient', () => {
  const ctx = fakeContext();
  steel.drawVignette(ctx, 512, 288);
  const { cx, cy, rx, ry, stops } = sky.SKY_VIGNETTE;
  assert.deepEqual(ctx.calls.filter(call => call[0] === 'stop'), stops.map(([at, alpha]) => ['stop', at, sky.skyVoid(alpha)]));
  assert.deepEqual(ctx.calls.find(call => call[0] === 'transform'), ['transform', 512 * rx, 0, 0, 288 * ry, 512 * cx, 288 * cy]);
  assert.deepEqual(ctx.calls.at(-1), ['transform', 1, 0, 0, 1, 0, 0], 'the context is left as it was found');
  const fill = ctx.calls.find(call => call[0] === 'fill');
  // in the unit circle's own coordinates the fill reaches beyond the canvas on every side (the gradient pads with its last stop)
  assert.ok(fill[1] < -(cx / rx) && fill[2] < -(cy / ry) && fill[1] + fill[3] > (1 - cx) / rx && fill[2] + fill[4] > (1 - cy) / ry);
  const css = sky.BRAND_SKY.backgroundImage;
  for (const [at, alpha] of stops) assert.ok(css.includes(`rgba(5, 6, 9, ${alpha}) ${Math.round(at * 1000) / 10}%`), `CSS has the stop ${at}`);
  assert.ok(css.includes(`ellipse ${rx * 100}% ${ry * 100}% at ${cx * 100}% ${cy * 100}%`));
});

test('the gate\'s CSS sky and the 3D sky share one tint and one darkening', () => {
  const css = sky.BRAND_SKY.backgroundImage;
  assert.ok(css.includes(`linear-gradient(${sky.SKY_TINT}, ${sky.SKY_TINT})`));
  assert.ok(css.includes(`rgba(5, 6, 9, ${sky.SKY_DARKEN})`));
  assert.equal(sky.BRAND_SKY.backgroundBlendMode, 'normal, normal, color, normal', 'the tint is a colour blend, as the canvas does for the nebula');
  assert.ok(sky.SKY_DARKEN > 0.3 && sky.SKY_DARKEN < 0.45);
});

test('the grade turns the sky over about half a second, never overshoots, and snaps when motion is reduced or the emblem has not drawn', () => {
  assert.equal(steel.stepGrade(1, 0, 0.016, true), 0);
  assert.equal(steel.stepGrade(0.5, 1, 0, false), 0.5, 'no time, no change');
  let grade = 1, seconds = 0;
  while (grade > 0 && seconds < 3) { const next = steel.stepGrade(grade, 0, 1 / 60, false); assert.ok(next <= grade); grade = next; seconds += 1 / 60; }
  assert.equal(grade, 0, 'it lands exactly on the target');
  assert.ok(seconds > 0.4 && seconds < 1.6, `the grade took ${seconds.toFixed(2)} s`);
});
