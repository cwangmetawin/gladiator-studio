import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const { bindHallControls } = await load('features/arena/hallControls.ts');
const { journeyProgress } = await load('features/arena/journeyProgress.ts');
const { hallScreens } = await load('features/arena/hallProgress.ts');

function rig(reduced = false) {
  const previous = globalThis.window, listeners = new Map(), pointerListeners = new Map(), timers = new Map(), scrolls = [];
  let active = true, now = 0, serial = 0, captured = false;
  const track = { style: { height: '290dvh' }, getBoundingClientRect: () => ({ top: 50 - host.scrollY }) };
  const root = {
    closest: () => track, getBoundingClientRect: () => ({ height: 900, width: 1440 }),
    addEventListener: (name, fn) => pointerListeners.set(name, fn), removeEventListener: name => pointerListeners.delete(name),
    setPointerCapture: () => { captured = true; }, releasePointerCapture: () => { captured = false; }, hasPointerCapture: () => captured,
    dataset: {},
  };
  const host = {
    scrollY: 50 + 1.9 * 900, innerHeight: 900, innerWidth: 1440,
    matchMedia: () => ({ matches: reduced }),
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
    scrollTo(options) { scrolls.push(options); this.scrollY = options.top; journeyProgress.publish((this.scrollY - 50) / 900); },
    setTimeout(fn, delay) { timers.set(++serial, { fn, due: now + delay }); return serial; }, clearTimeout: id => timers.delete(id),
  };
  globalThis.window = host;
  const controls = bindHallControls(root, 8, () => active);
  journeyProgress.publish(1.9);
  const fire = (name, fields = {}) => {
    let prevented = false;
    const event = { key: '', target: { closest: () => null }, pointerType: 'touch', pointerId: 1, button: 0,
      clientX: 0, clientY: 0, cancelable: true, preventDefault: () => { prevented = true; }, ...fields };
    (pointerListeners.get(name) ?? listeners.get(name))?.(event);
    return prevented;
  };
  return {
    controls, host, root, track, listeners, pointerListeners, scrolls, timers, fire,
    active: value => { active = value; }, captured: () => captured,
    advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); } },
    dispose() { controls.dispose(); journeyProgress.publish(0); if (previous === undefined) delete globalThis.window; else globalThis.window = previous; },
  };
}

test('native scrolling keeps the original dive, extends the track, and snaps only after 200 ms without input', () => {
  const r = rig();
  try {
    assert.equal(Number.parseFloat(r.track.style.height), 738);
    assert.equal(r.listeners.has('wheel'), false); assert.equal(r.listeners.has('touchmove'), false);
    journeyProgress.publish(1.9 + 2.4 * 0.64);
    r.advance(199); assert.equal(r.scrolls.length, 0);
    r.advance(1); assert.equal(r.scrolls.length, 1);
    assert.ok(Math.abs(r.scrolls[0].top - (50 + hallScreens(2, 8) * 900)) < 1e-8);
    journeyProgress.publish(0.5); r.advance(300);
    assert.equal(r.scrolls.length, 1, 'no snap inside the helmet journey');
  } finally { r.dispose(); }
});

test('arrows and tick selection publish their scroll destination in the input handler and ignore covered home/forms/modifiers', () => {
  const r = rig();
  try {
    assert.equal(r.fire('keydown', { key: 'ArrowRight' }), true);
    assert.equal(journeyProgress.getSnapshot(), hallScreens(1, 8));
    r.controls.select(5); assert.equal(journeyProgress.getSnapshot(), hallScreens(5, 8));
    r.active(false); r.fire('keydown', { key: 'ArrowRight' }); r.controls.select(6);
    assert.equal(journeyProgress.getSnapshot(), hallScreens(5, 8));
    r.active(true);
    for (const extra of [{ ctrlKey: true }, { altKey: true }, { defaultPrevented: true }, { target: { closest: () => ({}) } }]) {
      assert.equal(r.fire('keydown', { key: 'ArrowRight', ...extra }), false);
    }
    assert.equal(r.fire('keydown', { key: 'ArrowDown' }), false, 'vertical keys remain native');
    assert.equal(r.fire('keydown', { key: 'Tab' }), false);
    assert.equal(journeyProgress.getSnapshot(), hallScreens(5, 8));
  } finally { r.dispose(); }
});

test('vertical swipes remain native, horizontal drags capture only after axis intent, and cancellation cleans up', () => {
  const r = rig();
  try {
    r.fire('pointerdown', { clientX: 200, clientY: 100 });
    assert.equal(r.captured(), false);
    assert.equal(r.fire('pointermove', { clientX: 204, clientY: 180 }), false);
    assert.equal(r.scrolls.length, 0);
    r.fire('pointercancel');
    r.fire('pointerdown', { clientX: 350, clientY: 100 });
    assert.equal(r.fire('pointermove', { clientX: 100, clientY: 105 }), true);
    assert.equal(r.captured(), true);
    const position = journeyProgress.getSnapshot();
    r.fire('pointerdown', { pointerId: 2, isPrimary: false, clientX: 20 });
    r.fire('pointermove', { pointerId: 2, clientX: 300 });
    assert.equal(journeyProgress.getSnapshot(), position, 'a second finger cannot take over the active drag');
    r.fire('pointerup', { pointerId: 2 });
    assert.equal(r.captured(), true, 'lifting a second finger cannot release the primary pointer');
    assert.ok(journeyProgress.getSnapshot() > 1.9);
    r.fire('pointerup'); assert.equal(r.captured(), false);
    r.advance(200); assert.equal(r.timers.size, 0);
    r.fire('pointerdown', { clientX: 200 }); r.fire('pointermove', { clientX: 10 }); r.fire('pointercancel');
    assert.equal(r.captured(), false);
  } finally { r.dispose(); }
});

test('reduced motion changes the selected card instantly, and cleanup removes every listener, timer and track override', () => {
  const r = rig(true);
  r.controls.select(7);
  assert.equal(r.scrolls.at(-1).behavior, 'instant');
  r.dispose();
  assert.equal(r.track.style.height, '290dvh');
  assert.equal(r.listeners.size, 0); assert.equal(r.pointerListeners.size, 0); assert.equal(r.timers.size, 0);
  assert.equal(journeyProgress.getLimit(), 1.9);
});
