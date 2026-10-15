import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../editorialLifecycle.ts', import.meta.url), 'utf8');
const load = async text => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString('base64')}`);
const lifecycle = await load(source);
function fixture(create = lifecycle.createRevealLifecycle, reducedMotion = false) {
  const states = [], timers = new Map();
  let visible, next = 0, disconnected = 0;
  const instance = create({ reducedMotion, onState: state => states.push(state),
    observe: callback => { visible = callback; return () => { disconnected++; }; },
    schedule: (callback, delay) => { timers.set(++next, { callback, delay }); return next; },
    cancel: id => timers.delete(id),
  });
  return { instance, states, timers, visible: () => visible?.(), disconnected: () => disconnected,
    expire: () => [...timers.values()].forEach(timer => timer.callback()) };
}
const mountContract = create => {
  const f = fixture(create);
  assert.equal(f.states.length, 0, 'render/factory never hides text');
  f.instance.mount();
  assert.equal(f.states.join(','), 'pending');
};
const safetyContract = create => {
  const f = fixture(create); f.instance.mount();
  assert.equal(f.timers.size, 1);
  const delay = [...f.timers.values()][0]?.delay;
  assert.equal(delay > 0 && delay <= 1800, true);
  f.expire();
  assert.equal(f.states.join(','), 'pending,visible');
};
const reducedContract = create => {
  const f = fixture(create, true); f.instance.mount();
  assert.equal(f.states.join(','), 'visible');
  assert.equal(f.timers.size, 0);
};

test('pre-reveal is only applied after mount', () => mountContract(lifecycle.createRevealLifecycle));
test('a bounded safety timeout reveals every prepared section if its observer never fires', () => safetyContract(lifecycle.createRevealLifecycle));
test('reduced motion never applies a pre-reveal state', () => reducedContract(lifecycle.createRevealLifecycle));
test('first intersection reveals once and releases its observer and timeout', () => {
  const f = fixture(); f.instance.mount(); f.visible(); f.visible();
  assert.equal(f.states.join(','), 'pending,visible');
  assert.equal(f.timers.size, 0);
  assert.equal(f.disconnected(), 1);
});
test('unmount cancels work and prevents late observer callbacks from changing content', () => {
  const f = fixture(); f.instance.mount(); f.instance.dispose(); f.visible(); f.expire();
  assert.equal(f.states.join(','), 'pending');
  assert.equal(f.timers.size, 0);
  assert.equal(f.disconnected(), 1);
});
test('missing IntersectionObserver leaves content immediately visible', () => {
  let state = '';
  const instance = lifecycle.createRevealLifecycle({ reducedMotion: false, onState: next => { state = next; } });
  instance.mount(); assert.equal(state, 'visible');
});
test('mutation checks reject removal of mount, reduced-motion, safety, once and disposal guards', async () => {
  const beforeMount = await load(source.replace('return { mount, reveal, dispose };', "onState('pending'); return { mount, reveal, dispose };"));
  assert.throws(() => mountContract(beforeMount.createRevealLifecycle), assert.AssertionError);
  const reduced = await load(source.replace('if (reducedMotion || !observe)', 'if (!observe)'));
  assert.throws(() => reducedContract(reduced.createRevealLifecycle), assert.AssertionError);
  const safety = await load(source.replace('timer = schedule(reveal, safetyMs);', 'timer = undefined;'));
  assert.throws(() => safetyContract(safety.createRevealLifecycle), assert.AssertionError);
  const once = await load(source.replace('if (disposed || revealed) return;', 'if (disposed) return;'));
  const repeated = fixture(once.createRevealLifecycle); repeated.instance.mount(); repeated.visible(); repeated.visible();
  assert.throws(() => assert.equal(repeated.states.join(','), 'pending,visible'), assert.AssertionError);
  const disposal = await load(source.replace('if (disposed || revealed) return;', 'if (revealed) return;'));
  const late = fixture(disposal.createRevealLifecycle); late.instance.mount(); late.instance.dispose(); late.visible();
  assert.throws(() => assert.equal(late.states.join(','), 'pending'), assert.AssertionError);
});
