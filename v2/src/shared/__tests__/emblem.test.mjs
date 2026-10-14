// Run with npm run test:unit. The gate emblem's two public faces:
//  - emblemAnchor: where the 2D emblem is on screen, the hand-off point M1's 3D emblem lights up in;
//  - emblemArcs: the idle electric arcs (one at a time, every 2.6-4.2 s, each 0.3 s).
import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from './sourceModule.mjs';
import { createClock, createHarness, harnessHooksUrl } from './hookHarness.mjs';

const pathsUrl = moduleUrl(source('../brand/emblemPaths.ts'));
const withPaths = text => text.replace("from './emblemPaths'", `from '${pathsUrl}'`);
const paths = await import(pathsUrl);
const anchorUrl = moduleUrl(withPaths(source('../brand/emblemAnchor.ts')));
const arcsUrl = moduleUrl(withPaths(source('../brand/emblemArcs.ts')));
const anchor = await import(anchorUrl);
const arcs = await import(arcsUrl);
const { GateEmblem } = await import(moduleUrl(source('../components/GateEmblem.tsx')
  .replaceAll("from 'react'", `from '${harnessHooksUrl(moduleUrl)}'`)
  .replace("from '@/shared/brand/emblemPaths'", `from '${pathsUrl}'`)
  .replace("from '@/shared/brand/emblemArcs'", `from '${arcsUrl}'`)
  .replace("from '@/shared/brand/emblemAnchor'", `from '${anchorUrl}'`)));

const rect = (x, y, width, height) => ({ x, y, width, height });

test('the anchor publishes the emblem rect, ignores an identical one, and stops notifying after unsubscribe', () => {
  const store = anchor.createEmblemAnchor();
  assert.equal(store.getSnapshot(), null, 'no gate, no rect');
  let notified = 0;
  const unsubscribe = store.subscribe(() => { notified += 1; });
  store.publish(rect(245, 186, 950, 241));
  assert.deepEqual(store.getSnapshot(), rect(245, 186, 950, 241));
  store.publish(rect(245, 186, 950, 241));
  assert.equal(notified, 1, 'the same rect again is not news');
  store.publish(rect(10, 186, 950, 241));
  assert.equal(notified, 2);
  store.publish(null);
  assert.equal(store.getSnapshot(), null, 'the gate left');
  assert.equal(notified, 3);
  unsubscribe();
  store.publish(rect(1, 2, 3, 4));
  assert.equal(notified, 3);
});

test('the helmet rect and emblem points are the emblem rect scaled from emblem units, so a 3D helmet can match', () => {
  const full = rect(100, 50, paths.EMBLEM_WIDTH, paths.EMBLEM_HEIGHT);
  const helmet = anchor.helmetRect(full);
  assert.deepEqual(helmet, rect(100 + paths.EMBLEM_HELMET_BOX.x, 50 + paths.EMBLEM_HELMET_BOX.y, paths.EMBLEM_HELMET_BOX.width, paths.EMBLEM_HELMET_BOX.height));
  const half = anchor.helmetRect(rect(0, 0, paths.EMBLEM_WIDTH / 2, paths.EMBLEM_HEIGHT / 2));
  assert.ok(Math.abs(half.width - paths.EMBLEM_HELMET_BOX.width / 2) < 1e-9 && Math.abs(half.x - paths.EMBLEM_HELMET_BOX.x / 2) < 1e-9);
  assert.deepEqual(anchor.emblemPoint(full, 0, 0), { x: 100, y: 50 });
  assert.deepEqual(anchor.emblemPoint(full, paths.EMBLEM_WIDTH, paths.EMBLEM_HEIGHT), { x: 100 + paths.EMBLEM_WIDTH, y: 50 + paths.EMBLEM_HEIGHT });
  const helmetCentre = helmet.x + helmet.width / 2;
  assert.ok(Math.abs(helmetCentre - (100 + paths.EMBLEM_WIDTH / 2)) < 1, 'the helmet sits on the emblem centre line');
});

test('arcs come one at a time, never the same feather twice, 2.6-4.2 s apart, and last 0.3 s', () => {
  assert.equal(arcs.ARC_FLASH_MS, 300);
  assert.equal(arcs.ARC_MIN_GAP_MS, 2600);
  assert.equal(arcs.ARC_MAX_GAP_MS, 4200);
  let seed = 12345;
  const next = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let previous = null;
  const seen = new Set();
  for (let round = 0; round < 400; round++) {
    const arc = arcs.nextArc(next, previous);
    assert.notEqual(arc.feather, previous, 'not the same feather twice in a row');
    assert.ok(arc.feather >= 0 && arc.feather < paths.EMBLEM_WINGS.length);
    assert.ok(arc.waitMs >= arcs.ARC_MIN_GAP_MS && arc.waitMs <= arcs.ARC_MAX_GAP_MS, `gap ${arc.waitMs}`);
    assert.ok(arc.waitMs > arcs.ARC_FLASH_MS, 'an arc has ended before the next starts');
    seen.add(arc.feather);
    previous = arc.feather;
  }
  assert.equal(seen.size, paths.EMBLEM_WINGS.length, 'every feather gets its turn');
  assert.equal(arcs.nextArc(() => 0.999999, 5).feather < paths.EMBLEM_WINGS.length, true, 'the top of the random range stays in bounds');
});

test('every feather has a deterministic arc that runs along its top edge, outwards from the helmet', () => {
  assert.equal(paths.EMBLEM_FEATHER_EDGES.length, paths.EMBLEM_WINGS.length);
  for (const feather of arcs.ARC_FEATHERS) {
    const geometry = arcs.arcGeometry(feather);
    assert.deepEqual(arcs.arcGeometry(feather), geometry, 'the same bolts on every load');
    assert.ok(geometry.length > 100, `feather ${feather} arc length ${geometry.length}`);
    assert.ok(Math.abs(geometry.angleDeg) < 3, 'the top edges are nearly level');
    assert.equal(geometry.mirrored, feather % 2 === 1, 'left-wing feathers are mirrored');
    for (const bolt of geometry.bolts) assert.match(bolt, /^M[\d. -]+(?:L[\d. -]+)+/);
    assert.notEqual(geometry.bolts[0], geometry.bolts[1], 'two jitters, so the bolt crackles');
    const edge = paths.EMBLEM_FEATHER_EDGES[feather];
    assert.ok(geometry.x >= edge.x0 - 1 && geometry.x <= edge.x1, 'starts on the feather');
  }
});

// ── The shipped component, on the hook harness ─────────────────────────────────

function mountEmblem(props) {
  const clock = createClock();
  const listeners = new Map();
  globalThis.window = {
    setTimeout: (...args) => clock.setTimeout(...args), clearTimeout: (...args) => clock.clearTimeout(...args),
    addEventListener: (type, listener) => listeners.set(type, listener), removeEventListener: type => listeners.delete(type),
  };
  let box = rect(245, 186, 950, 241);
  const harness = createHarness(GateEmblem, { attach: type => (type === 'div' ? { getBoundingClientRect: () => box } : null) });
  harness.mount(props);
  return { harness, clock, listeners, moveTo: next => { box = next; } };
}

test('the emblem publishes its on-screen rect for the 3D hand-off, follows resizes and withdraws it when the gate goes', () => {
  anchor.emblemAnchor.publish(null);
  const view = mountEmblem({ mode: 'idle', reducedMotion: false });
  assert.deepEqual(anchor.emblemAnchor.getSnapshot(), rect(245, 186, 950, 241));
  view.moveTo(rect(10, 20, 437, 111));
  view.listeners.get('resize')();
  assert.deepEqual(anchor.emblemAnchor.getSnapshot(), rect(10, 20, 437, 111), 'kept current through resizes');
  view.harness.unmount();
  assert.equal(anchor.emblemAnchor.getSnapshot(), null, 'no gate, no rect');
  assert.equal(view.listeners.size, 0, 'the resize listener is gone');
});

test('idle arcs start 0.9 s after the gate shows; the exit, the refusal page and reduced motion run none', () => {
  const idle = mountEmblem({ mode: 'idle', reducedMotion: false });
  assert.deepEqual(idle.clock.pending, [arcs.ARC_FIRST_MS]);
  idle.harness.update({ mode: 'ignite', reducedMotion: false });
  assert.deepEqual(idle.clock.pending, [], 'the exit takes the arcs away');
  idle.harness.unmount();
  for (const props of [{ mode: 'idle', reducedMotion: true }, { mode: 'off', reducedMotion: false }]) {
    const view = mountEmblem(props);
    assert.deepEqual(view.clock.pending, [], JSON.stringify(props));
    view.harness.unmount();
  }
});
