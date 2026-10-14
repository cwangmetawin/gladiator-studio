// Run with npm run test:unit. What the starfield scene shows at home (Phase 4 M1): no planet and no sun glow in the
// first screen's picture; they fade with a panel's camera flight, by visibility alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLoader } from './loadTs.mjs';

const { load } = createLoader();
const { fadeBodies } = await load('features/starfield/skyBodies.ts');
const RATE = 3.7;
const body = visibility => ({ visibility });

test('a group shares one fade: the ring follows its planet, from the first member\'s visibility', () => {
  const planet = body(1), ring = body(0.4);
  fadeBodies([planet, ring], 0, RATE, 1 / 60, false);
  assert.equal(planet.visibility, ring.visibility, 'one value for the whole group');
  assert.ok(planet.visibility < 1 && planet.visibility > 0.9);
});

test('a fade towards 0 lands exactly on 0 (a hidden body is not drawn at all) and never overshoots', () => {
  const planet = body(1);
  let last = 1, frames = 0;
  while (planet.visibility > 0 && frames < 600) {
    fadeBodies([planet], 0, RATE, 1 / 60, false);
    assert.ok(planet.visibility <= last, 'monotone');
    last = planet.visibility; frames++;
  }
  assert.equal(planet.visibility, 0);
  assert.ok(frames / 60 < 2, `it took ${(frames / 60).toFixed(2)} s`);
});

test('a fade towards 1 lands exactly on 1 and stays there', () => {
  const planet = body(0);
  for (let frame = 0; frame < 600 && planet.visibility < 1; frame++) fadeBodies([planet], 1, RATE, 1 / 60, false);
  assert.equal(planet.visibility, 1);
  fadeBodies([planet], 1, RATE, 1 / 60, false);
  assert.equal(planet.visibility, 1);
});

test('instant (reduced motion, the very first frame) jumps to the target in a frame of no time', () => {
  const group = [body(1), body(1), body(1)];
  fadeBodies(group, 0, RATE, 0, true);
  assert.deepEqual(group.map(member => member.visibility), [0, 0, 0]);
});

test('no time, no change; and an empty group is not an error', () => {
  const planet = body(0.5);
  fadeBodies([planet], 0, RATE, 0, false);
  assert.equal(planet.visibility, 0.5);
  assert.doesNotThrow(() => fadeBodies([], 1, RATE, 1 / 60, false));
});

test('the starfield scene starts at home with its planets and its sun glow already out of the picture, and brings them in only for a camera flight', () => {
  // The scene itself needs WebGL, so this pins the wiring in the shipped source: every body group is faded by the same
  // call, the first frame is instant, and the only thing that brings a body in is a panel's camera flight.
  const source = readFileSync(new URL('../../features/starfield/StarfieldBackground.tsx', import.meta.url), 'utf8');
  assert.match(source, /showBodies\(0, true\);\s*\/\/ the very first frame is already the home picture/);
  assert.match(source, /cameraHasPanel && planet\.panelId === focalPanelId \? 1 : 0/);
  assert.match(source, /fadeBodies\(distantBodies, cameraHasPanel \? 1 : 0/);
  assert.match(source, /fadeBodies\(\[sunGlow\], cameraHasPanel \? 1 : 0/);
  assert.match(source, /distantBodies = \[planets\.mars, planets\.gasGiant, planets\.gasRing, planets\.iceMoon\]/);
  assert.doesNotMatch(source, /!cameraHasPanel \|\| p\.panelId === focalPanelId/, 'the old rule that showed every planet at home is gone');
});
