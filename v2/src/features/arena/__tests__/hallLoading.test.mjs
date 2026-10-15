import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';
import { createClock, createHarness, harnessHooksUrl } from '../../../shared/__tests__/hookHarness.mjs';

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
    hasPointerCapture: () => false,
  };
  globalThis.window = host; globalThis.__hallCatalogue = games;
  globalThis.fetch = (url, options) => { calls.push({ url, options }); return new Promise(done => { resolve = done; }); };
  // Only React's hook runtime is simulated. The shipped component, controls,
  // catalogue selection, manifest parser, publication and copy are all real.
  const harness = createHarness(props => { const copy = ArenaLanding(props); return copy.type(copy.props); }, { attach: () => root });
  return { harness, calls, listeners, pointers, clock, track,
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
