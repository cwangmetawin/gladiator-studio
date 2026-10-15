import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';
import { createClock, createHarness, findAll, harnessHooksUrl } from '../../../shared/__tests__/hookHarness.mjs';
import { audioRecorder } from '../../../shared/__tests__/audioRecorder.mjs';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { load } = createLoader({
  react: harnessHooksUrl(moduleUrl), './hall.css': moduleUrl(''),
  '@/shared/content/StudioStats': moduleUrl(`
    export const useCatalogueGames = () => globalThis.__hallCatalogue;
    export const useStudioStats = () => ({ games: globalThis.__hallCatalogue.length });
  `),
});
const { ArenaLanding } = await load('features/arena/ArenaLanding.tsx');
const { hallContent } = await load('features/arena/hallState.ts');
const { journeyProgress } = await load('features/arena/journeyProgress.ts');
const { hallScreens } = await load('features/arena/hallProgress.ts');
const { soundEngine } = await load('shared/utils/soundEngine.ts');
const games = [{ id: 1, title: 'First game', slug: 'first-game', category: 'slot', image: 'https://content.prod.platform.mwapp.io/games/first.jpg', timeline: '', link: 'https://example.com' }];
const manifest = { version: 1, entries: { 'first-game': {
  source: games[0].image, primary: [.2, .6, .3], secondary: [.8, .4, .2], widths: {
    '320': { url: '/arena/games/first-game-320.webp', width: 320, height: 429, bytes: 1000 },
    '640': { url: '/arena/games/first-game-640.webp', width: 640, height: 858, bytes: 3000 },
  },
} } };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function rig() {
  const original = { window: globalThis.window, fetch: globalThis.fetch, __hallCatalogue: globalThis.__hallCatalogue };
  const clock = createClock(), calls = [], listeners = new Map(), pointers = new Map(), queries = [];
  let resolve;
  const host = { innerWidth: 390, innerHeight: 844, scrollY: 0, ...clock,
    matchMedia(query) {
      const callbacks = new Set();
      const media = { query, matches: query.includes('max-width') && host.innerWidth < 768,
        addEventListener: (_, fn) => callbacks.add(fn), removeEventListener: (_, fn) => callbacks.delete(fn), callbacks };
      queries.push(media); return media;
    },
    addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key),
    scrollTo(options) { this.scrollY = options.top; },
  };
  const track = { style: { height: '290dvh' }, getBoundingClientRect: () => ({ top: -host.scrollY }) };
  const root = { closest: () => track, getBoundingClientRect: () => ({ width: 390, height: 844 }), dataset: {},
    addEventListener: (key, fn) => pointers.set(key, fn), removeEventListener: key => pointers.delete(key),
    hasPointerCapture: () => false, setPointerCapture() {}, releasePointerCapture() {},
  };
  globalThis.window = host; globalThis.__hallCatalogue = games;
  globalThis.fetch = (url, options) => { calls.push({ url, options }); return new Promise(done => { resolve = done; }); };
  // Only React's hook runtime is simulated. The shipped component, controls,
  // catalogue selection, manifest parser, publication and copy are all real.
  const harness = createHarness(props => { const copy = ArenaLanding(props); return copy.type(copy.props); }, { attach: () => root });
  return { harness, calls, listeners, pointers, clock, track, host,
    resize(width) {
      host.innerWidth = width;
      for (const media of queries) if (media.query.includes('max-width') && media.matches !== (width < 768)) {
        media.matches = width < 768; media.callbacks.forEach(fn => fn({ matches: media.matches }));
      }
    },
    finish(value = manifest) { resolve({ ok: true, json: async () => value }); },
    dispose() { harness.unmount(); for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } journeyProgress.setLimit(1.9); journeyProgress.publish(0); hallContent.publish([]); },
  };
}

test('the shipped landing requests nothing on the first screen and publishes baked art only after the manifest resolves', async () => {
  const r = rig(), props = { visible: false, interactive: true, onPlayGame() {} };
  try {
    r.harness.mount(props);
    assert.equal(r.calls.length, 0); assert.equal(hallContent.getSnapshot().length, 0);
    r.harness.update({ ...props, visible: true });
    assert.equal(r.calls.length, 1);
    assert.equal(hallContent.getSnapshot().length, 0, 'no eager 1 MB catalogue textures while the manifest is still pending');
    r.finish(); await settle(); r.harness.act(() => {});
    assert.equal(hallContent.getSnapshot()[0].cover.url, '/arena/games/first-game-320.webp');
    assert.equal(r.calls.length, 1);
    globalThis.__hallCatalogue = [];
    r.harness.act(() => {});
    assert.equal(hallContent.getSnapshot().length, 0, 'an owner hiding every game removes the ring');
    assert.equal(r.track.style.height, '290dvh');
  } finally { r.dispose(); }
});

test('unmount aborts the manifest request, a late response cannot publish game art, and listeners/timers are released', async () => {
  const r = rig();
  try {
    r.harness.mount({ visible: true, interactive: true, onPlayGame() {} });
    const signal = r.calls[0].options.signal;
    r.harness.unmount();
    assert.equal(signal.aborted, true);
    r.finish(); await settle();
    assert.equal(hallContent.getSnapshot().length, 0);
    assert.equal(r.listeners.size, 0); assert.equal(r.pointers.size, 0); assert.equal(r.clock.pending.length, 0);
  } finally { r.dispose(); }
});

test('an unavailable manifest releases catalogue covers after the request finishes, and a hung request is bounded', async () => {
  const r = rig();
  try {
    r.harness.mount({ visible: true, interactive: true, onPlayGame() {} });
    r.clock.advance(4000);
    assert.equal(r.calls[0].options.signal.aborted, true);
    // Native fetch rejects on abort; an invalid response follows the same neutral fallback.
    r.finish({ invalid: true }); await settle(); r.harness.act(() => {});
    assert.equal(hallContent.getSnapshot()[0].cover.url, games[0].image);
    assert.deepEqual(hallContent.getSnapshot()[0].cover.primary, [.36, .5, .62]);
    assert.equal(r.clock.pending.length, 0);
  } finally { r.dispose(); }
});

test('a phone keeps 320 px textures and its compact ring after rotating into landscape', async () => {
  const r = rig();
  try {
    r.harness.mount({ visible: true, interactive: true, onPlayGame() {} });
    r.finish(); await settle(); r.harness.act(() => {});
    assert.equal(hallContent.getSnapshot()[0].cover.width, 320);
    r.harness.act(() => r.resize(844));
    assert.equal(hallContent.getSnapshot()[0].cover.width, 320);
    assert.equal(hallContent.getSnapshot()[0].compact, true);
  } finally { r.dispose(); }
});

test('the real landing, controls and sound engine share one centre-change cue for scroll, keys, ticks and drag', () => {
  const previous = { AudioContext: globalThis.AudioContext, performance: globalThis.performance, document: globalThis.document };
  const r = rig(), { AudioContext, record } = audioRecorder(), chunks = [], documentListeners = new Map();
  let now = 0;
  globalThis.AudioContext = AudioContext; globalThis.performance = { now: () => now };
  globalThis.document = { hidden: false, addEventListener: (name, fn) => documentListeners.set(name, fn), removeEventListener: name => documentListeners.delete(name) };
  r.host.requestIdleCallback = callback => chunks.push(callback);
  globalThis.__hallCatalogue = Array.from({ length: 3 }, (_, i) => ({ ...games[0], id: i + 1, title: `Game ${i + 1}` }));
  const props = { visible: true, interactive: true, onPlayGame() {} };
  const event = extra => ({ pointerId: 1, button: 0, clientY: 100, target: { closest: () => null }, preventDefault() {}, cancelable: true, ...extra });
  try {
    soundEngine.unlock(); while (chunks.length) chunks.shift()();
    r.host.scrollY = 1.9 * 844;
    r.harness.mount(props); assert.equal(record.oscillators.length, 0, 'initial centre primes silently');
    r.harness.act(() => journeyProgress.publish(hallScreens(1, 3)));
    assert.equal(record.oscillators.length, 1, 'native scroll');
    now = 200; r.harness.act(() => r.listeners.get('keydown')(event({ key: 'ArrowRight' })));
    assert.equal(record.oscillators.length, 2, 'keyboard');
    now = 400;
    r.harness.act(() => findAll(r.harness.output, node => node.props?.['aria-label'] === 'Show Game 1')[0].props.onClick());
    assert.equal(record.oscillators.length, 3, 'tick mark, without a generic click');
    now = 600;
    r.harness.act(() => { r.pointers.get('pointerdown')(event({ clientX: 350 })); r.pointers.get('pointermove')(event({ clientX: 38 })); r.pointers.get('pointerup')(event({})); });
    assert.equal(record.oscillators.length, 4, 'horizontal drag');
    now = 610; r.harness.act(() => journeyProgress.publish(hallScreens(2, 3)));
    now = 620; r.harness.act(() => journeyProgress.publish(hallScreens(0, 3)));
    assert.equal(record.oscillators.length, 4, 'rapid changes share the real engine throttle');
    now = 900; r.harness.update({ ...props, interactive: false });
    r.harness.act(() => journeyProgress.publish(hallScreens(2, 3)));
    r.harness.update(props); assert.equal(record.oscillators.length, 4, 'uncover does not replay');
    now = 1200; r.harness.act(() => r.listeners.get('keydown')(event({ key: 'ArrowLeft' })));
    assert.equal(record.oscillators.length, 5);
    globalThis.document.hidden = true; documentListeners.get('visibilitychange')();
    now = 1500; r.harness.act(() => journeyProgress.publish(hallScreens(0, 3)));
    globalThis.document.hidden = false; documentListeners.get('visibilitychange')();
    assert.equal(record.oscillators.length, 5, 'background changes stay silent');
    now = 1800; r.harness.act(() => journeyProgress.publish(hallScreens(1, 3)));
    assert.equal(record.oscillators.length, 6, 'the first visible change after return works');
  } finally {
    r.dispose(); assert.equal(documentListeners.size, 0);
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
