import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './loadTs.mjs';

const loader = createLoader();
const { createPageGates, ARENA_GATE_IDS } = await loader.load('features/arena/pageGates.ts');
const { ARENA_CENTER, ARENA_RADIUS, colosseumLines } = await loader.load('features/arena/colosseumGeometry.ts');
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} / ${b}`);

test('all seven sections and Client Area occupy eight evenly spread ground-tier bays', () => {
  assert.deepEqual([...ARENA_GATE_IDS], ['games', 'about', 'team', 'journey', 'live', 'careers', 'contact', 'partner']);
  for (const bays of [40, 64]) {
    const gates = createPageGates(bays);
    assert.equal(gates.length, 8);
    assert.equal(new Set(gates.map(gate => gate.bay)).size, 8);
    gates.forEach((gate, i) => {
      assert.equal(gate.id, ARENA_GATE_IDS[i]);
      assert.equal(gate.bay, i * bays / 8);
      near(gate.angle, -Math.PI / 2 + i * Math.PI / 4, 'even angular spacing');
      near(Math.hypot(gate.center[0] - ARENA_CENTER[0], gate.center[2] - ARENA_CENTER[2]), ARENA_RADIUS, 'wall radius');
      near(gate.floorY, ARENA_CENTER[1], 'ground tier');
      assert.ok(gate.center[1] > gate.floorY && gate.center[1] < gate.springY, 'eye crosses clear arch opening');
      assert.ok(Math.hypot(gate.restPose.x - ARENA_CENTER[0], gate.restPose.z - ARENA_CENTER[2]) < 12, 'rest lies inside sand ring');
      near(gate.outward[0], Math.cos(gate.angle), 'normal x');
      near(gate.outward[2], Math.sin(gate.angle), 'normal z');
    });
  }
});

test('gate outlines follow the actual ground arcade instead of drawing a floating doorway', () => {
  for (const bays of [40, 64]) {
    const outlines = colosseumLines(bays);
    for (const gate of createPageGates(bays)) {
      const expected = outlines.filter(line => line.kind === 'arcade')[gate.bay * 4 + 1].points;
      assert.equal(gate.arch.length, expected.length + 2);
      expected.forEach((point, i) => point.forEach((value, axis) => near(gate.arch[i + 1][axis], value, 'shared arcade crown')));
      near(gate.arch[0][1], gate.floorY, 'left foot on floor');
      near(gate.arch.at(-1)[1], gate.floorY, 'right foot on floor');
      near(Math.max(...gate.arch.map(point => point[1])), gate.crownY, 'actual crown height');
    }
  }
});

test('only integral bay counts that can house eight distinct aligned entrances are accepted', () => {
  for (const invalid of [0, 7, 9, 63, 129, 64.5, NaN]) assert.throws(() => createPageGates(invalid));
  assert.equal(createPageGates(8).length, 8);
});
