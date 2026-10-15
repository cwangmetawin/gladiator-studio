import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const { load } = createLoader({
  '@/shared/content/StudioStats': data('export const useStudioStats = () => globalThis.__journeyStats;'),
});
const { bindJourneyScroll, lockJourneyScroll } = await load('features/arena/journeyScroll.ts');
const { journeyProgress } = await load('features/arena/journeyProgress.ts');
const { ArenaLanding } = await load('features/arena/ArenaLanding.tsx');
const require = createRequire(import.meta.url);
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');

function rig() {
  const original = { window: globalThis.window, document: globalThis.document, ResizeObserver: globalThis.ResizeObserver };
  const listeners = new Map(), preferenceListeners = new Set(), writes = new Map();
  let disconnected = false;
  const query = { matches: false, addEventListener: (_, fn) => preferenceListeners.add(fn), removeEventListener: (_, fn) => preferenceListeners.delete(fn) };
  const host = {
    scrollY: 100, innerHeight: 900,
    addEventListener: (type, fn, options) => { listeners.set(type, { fn, options }); },
    removeEventListener: (type, fn) => { if (listeners.get(type)?.fn === fn) listeners.delete(type); },
    matchMedia: () => query,
  };
  const style = { overflowY: 'auto', scrollbarGutter: '' };
  const root = {
    style: { setProperty: (name, value) => writes.set(name, value) }, dataset: {},
    getBoundingClientRect: () => ({ height: 900 }),
    closest: () => ({ getBoundingClientRect: () => ({ top: 100 - host.scrollY }) }),
  };
  globalThis.window = host;
  globalThis.document = { documentElement: { style } };
  globalThis.ResizeObserver = class { observe() {} disconnect() { disconnected = true; } };
  return {
    host, listeners, query, preferenceListeners, writes, root, style,
    disconnected: () => disconnected,
    restore: () => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } journeyProgress.publish(0); },
  };
}

test('native scrolling publishes the actual offset, never installs wheel/key/touch handlers, and cleans up', () => {
  const r = rig();
  try {
    const stop = bindJourneyScroll(r.root);
    assert.equal(journeyProgress.getSnapshot(), 0);
    assert.deepEqual([...r.listeners.keys()].sort(), ['resize', 'scroll']);
    assert.equal(r.listeners.get('scroll').options.passive, true);
    r.host.scrollY = 910; r.listeners.get('scroll').fn();
    assert.equal(journeyProgress.getSnapshot(), 0.9);
    r.host.scrollY = 1810; r.listeners.get('scroll').fn();
    assert.equal(journeyProgress.getSnapshot(), 1.9);
    assert.equal(r.writes.get('--arena-opacity'), '1.000');
    r.query.matches = true;
    r.host.scrollY = 999; r.listeners.get('scroll').fn();
    assert.equal(r.writes.get('--hero-opacity'), '1.000');
    r.host.scrollY = 1000; r.listeners.get('scroll').fn();
    assert.equal(r.writes.get('--hero-opacity'), '0.000');
    assert.equal(r.writes.get('--arena-rise'), '0px', 'no translation on the cut');
    stop();
    assert.equal(r.listeners.size, 0);
    assert.equal(r.preferenceListeners.size, 0);
    assert.equal(r.disconnected(), true);
  } finally { r.restore(); }
});

test('covering the home locks only document scrolling and closing restores the existing style and position', () => {
  const r = rig();
  try {
    r.host.scrollY = 1370;
    const unlock = lockJourneyScroll();
    assert.equal(r.style.overflowY, 'hidden');
    assert.equal(r.host.scrollY, 1370);
    unlock();
    assert.equal(r.style.overflowY, 'auto');
    assert.equal(r.host.scrollY, 1370);
  } finally { r.restore(); }
});

const textOf = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(textOf).join('') : node?.props ? textOf(node.props.children) : '';
const find = (node, type) => !node || typeof node !== 'object' ? null : Array.isArray(node)
  ? node.map(child => find(child, type)).find(Boolean) : node.type === type ? node : find(node.props?.children, type);

test('the small second screen reads the current catalogue count, has no game images or RTP, and asks for the existing games panel once', () => {
  globalThis.__journeyStats = { games: 41 };
  try {
    const markup = renderToStaticMarkup(React.createElement(ArenaLanding, { visible: true }));
    assert.match(markup, /41 games\./);
    assert.match(markup, /One arena\./);
    assert.doesNotMatch(markup, /\b38\b|RTP|<img|<canvas|<iframe/);
    assert.equal(markup.match(/<button\b/g)?.length, 1);
    const previous = globalThis.window, events = [], order = [];
    globalThis.window = { dispatchEvent: event => { order.push('request'); events.push(event); } };
    try {
      const button = find(ArenaLanding({ visible: true }), 'button');
      assert.equal(textOf(button), 'Explore the games');
      button.props.onClick({ currentTarget: { focus: options => { assert.equal(options.preventScroll, true); order.push('focus'); } } });
      assert.deepEqual(order, ['focus', 'request'], 'the panel captures its button even on browsers that do not focus clicked buttons');
      assert.equal(events.length, 1);
      assert.equal(events[0].type, 'open-panel');
      assert.equal(events[0].detail, 'games');
    } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
    const hidden = renderToStaticMarkup(React.createElement(ArenaLanding, { visible: false }));
    assert.match(hidden, /inert=""/);
    assert.match(hidden, /aria-hidden="true"/);
  } finally { delete globalThis.__journeyStats; }
});
