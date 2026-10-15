import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const { createCrossingSound, createHallSound, canFireArenaArc } = await load('features/arena/arenaSound.ts');
const { HELMET_CROSSING_SCREENS } = await load('features/arena/diveFlash.ts');

test('forward camera crossing sounds once on desktop and phone; reverse and boundary jitter are silent', () => {
  for (const phone of [false, true]) {
    const heard = [], crossing = createCrossingSound(0, soft => heard.push(soft));
    const update = (screens, nowMs) => crossing.update({ screens, nowMs, reduced: false, enabled: true });
    const at = HELMET_CROSSING_SCREENS;
    update(at - 0.001, 0); update(at, 10); update(at + 0.01, 20);
    update(at - 0.002, 30); update(at + 0.002, 40);
    assert.deepEqual(heard, [false], `phone=${phone}`);
    update(0, 100); update(at + 0.01, 200);
    assert.equal(heard.length, 1, 'a quick full reversal cannot burst');
    update(0, 900); update(at, 1000);
    assert.deepEqual(heard, [false, false]);
  }
});

test('covered crossings, initial deep links and preference changes do not replay later; reduced cuts are soft', () => {
  const heard = [], crossing = createCrossingSound(0, soft => heard.push(soft));
  const step = (screens, enabled, reduced, nowMs) => crossing.update({ screens, enabled, reduced, nowMs });
  step(1.5, false, false, 0); step(1.5, true, false, 1000);
  assert.deepEqual(heard, []);
  step(0, true, true, 1500); step(1.9, true, true, 1600); step(1.9, true, true, 1700);
  assert.deepEqual(heard, [true]);
  step(0, true, false, 3000); step(1, true, false, 3100);
  assert.deepEqual(heard, [true, false]);
  const restored = createCrossingSound(1.9, () => heard.push('restored'));
  restored.update({ screens: 1.9, enabled: true, reduced: false, nowMs: 10000 });
  assert.deepEqual(heard, [true, false]);
});

test('hall changes prime silently and consume hidden changes without playing on uncover', () => {
  let ticks = 0;
  const hall = createHallSound(() => ticks++);
  hall.update('first', false); hall.update('first', true); assert.equal(ticks, 0);
  hall.update('second', true); hall.update('second', true); assert.equal(ticks, 1);
  hall.update('third', false); hall.update('fourth', false); hall.update('fourth', true);
  assert.equal(ticks, 1);
  hall.update('first', true); assert.equal(ticks, 2);
  hall.update(null, true); hall.update('first', true); assert.equal(ticks, 2, 'catalogue reload primes silently');
});

test('a visual arc can fire only on the released, visible, uncovered animated first screen', () => {
  const state = { home: true, covered: false, reduced: false, seconds: 1, ready: true, visibility: 1, presence: 1 };
  assert.equal(canFireArenaArc(state), true);
  for (const change of [{ home: false }, { covered: true }, { reduced: true }, { seconds: -1 }, { ready: false }, { visibility: 0.4 }, { presence: 0.4 }]) {
    assert.equal(canFireArenaArc({ ...state, ...change }), false, JSON.stringify(change));
  }
});
