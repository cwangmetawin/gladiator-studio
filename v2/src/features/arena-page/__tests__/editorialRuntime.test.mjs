import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';
import { moduleUrl } from '../../../shared/__tests__/sourceModule.mjs';
import { createClock, createHarness, harnessHooksUrl, findAll } from '../../../shared/__tests__/hookHarness.mjs';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const hooks = data(`export * from '${pathToFileURL(require.resolve('react')).href}'; export { useState, useRef, useEffect } from '${harnessHooksUrl(moduleUrl)}';`);
const { urlOf } = createLoader();
const source = readFileSync(new URL('../Editorial.tsx', import.meta.url), 'utf8');
const runtime = await import(moduleUrl(source
  .replace(/^import\s+['"]\.\/editorialBody\.css['"];?\s*$/mu, '')
  .replace("from 'react'", `from '${hooks}'`)
  .replace("from '@/shared/motion/useMotionPreference'", `from '${data('export const useMotionPreference = () => globalThis.__editorialReduced === true;')}'`)
  .replace("from './editorialLifecycle'", `from '${urlOf('features/arena-page/editorialLifecycle.ts')}'`)
  .replace("from './editorialMotion'", `from '${urlOf('features/arena-page/editorialMotion.ts')}'`)
  .replace("from './HeadlineWords'", `from '${data('export const HeadlineWords = () => null;')}'`)
  .replace(/function (IndexRuntime|CounterRuntime|TimelineRuntime|ChapterRuntime)\(/gu, 'export function $1(')));

function environment() {
  const keys = ['window', 'document', 'IntersectionObserver', 'CSS', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', '__editorialReduced'];
  const saved = new Map(keys.map(key => [key, globalThis[key]]));
  const observers = [], frames = new Map(), clock = createClock();
  let next = 0;
  globalThis.window = {}; globalThis.document = {}; globalThis.CSS = { escape: value => value };
  globalThis.__editorialReduced = false;
  globalThis.setTimeout = clock.setTimeout; globalThis.clearTimeout = clock.clearTimeout;
  globalThis.IntersectionObserver = class {
    constructor(callback, options) { this.callback = callback; this.options = options; this.nodes = new Set(); this.stopped = 0; observers.push(this); }
    observe(node) { this.nodes.add(node); }
    disconnect() { this.stopped++; this.nodes.clear(); }
  };
  globalThis.requestAnimationFrame = callback => { const id = ++next; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  return { observers, frames, clock,
    frame: delta => { const work = [...frames.values()]; frames.clear(); work.forEach(callback => callback(performance.now() + delta)); },
    restore: () => { for (const [key, value] of saved) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } },
  };
}
// Runtime children return hook-free markup; expand that layer while the hook harness owns the render.
const expand = Component => props => { const output = Component(props); return output.type(output.props); };
const links = output => findAll(output, element => element.type === 'a');

test('chapter index observes inside the page box, tracks aria-current, scrolls and focuses the selected heading', () => {
  const env = environment();
  let focused = 0, top = -1, behavior = '', prevented = 0;
  const root = { querySelector: selector => selector === '#second' ? second : first,
    scrollTo: options => { top = options.top; behavior = options.behavior; } };
  const heading = { setAttribute: (name, value) => { assert.equal(`${name}:${value}`, 'tabindex:-1'); }, focus: () => { focused++; } };
  const first = { id: 'first', offsetTop: 100, offsetParent: root, querySelector: () => heading };
  const second = { id: 'second', offsetTop: 640, offsetParent: root, querySelector: () => heading };
  const nav = { closest: selector => { assert.equal(selector, '.partner__scroll'); return root; } };
  const h = createHarness(expand(runtime.IndexRuntime), { attach: () => nav });
  const chapters = [{ id: 'first', label: 'First' }, { id: 'second', label: 'Second' }];
  try {
    h.mount({ chapters });
    assert.equal(env.observers[0].options.root === root, true);
    assert.equal(env.observers[0].nodes.size, 2);
    assert.equal(links(h.output)[0].props['aria-current'], 'true');
    h.act(() => env.observers[0].callback([{ target: second, isIntersecting: true, intersectionRatio: 0.8 }]));
    assert.equal(links(h.output)[1].props['aria-current'], 'true');
    h.act(() => links(h.output)[1].props.onClick({ preventDefault: () => { prevented++; } }));
    assert.equal(top, 608); assert.equal(behavior, 'smooth'); assert.equal(focused, 1); assert.equal(prevented, 1);
    globalThis.__editorialReduced = true; h.update({ chapters });
    h.act(() => links(h.output)[0].props.onClick({ preventDefault() {} }));
    assert.equal(behavior, 'instant');
    h.unmount(); assert.equal(env.observers[0].stopped, 1);
  } finally { h.unmount(); env.restore(); }
});

test('counter starts once on first view, keeps an exact accessible final value and cancels queued frames', () => {
  const env = environment(), root = {}, display = { textContent: '97.1%' }, node = { closest: () => root };
  const h = createHarness(expand(runtime.CounterRuntime), { attach: (_type, props) => props.className === 'editorial-counter' ? node : display });
  try {
    h.mount({ value: 97.1, decimals: 1, suffix: '%', label: 'Maximum RTP' });
    assert.equal(h.output.props['aria-label'], '97.1% Maximum RTP');
    assert.equal(env.observers[0].options.root === root, true);
    env.observers[0].callback([{ isIntersecting: true }]);
    assert.equal(display.textContent, '0.0%'); assert.equal(env.frames.size, 1);
    env.frame(950); assert.equal(display.textContent, '97.1%'); assert.equal(env.frames.size, 0);
    env.observers[0].callback([{ isIntersecting: true }]); assert.equal(env.frames.size, 0);
    h.update({ value: 42, label: 'Titles' });
    assert.equal(env.observers.length, 1); assert.equal(env.frames.size, 0); assert.equal(display.textContent, '42');
    h.unmount();
    const fresh = createHarness(expand(runtime.CounterRuntime), { attach: (_type, props) => props.className === 'editorial-counter' ? node : display });
    fresh.mount({ value: 12 }); env.observers[1].callback([{ isIntersecting: true }]);
    assert.equal(env.frames.size, 1); fresh.unmount(); assert.equal(env.frames.size, 0); assert.equal(display.textContent, '12');
  } finally { h.unmount(); env.restore(); }
});

test('reduced-motion counter never schedules counting or an observer', () => {
  const env = environment(); globalThis.__editorialReduced = true;
  const h = createHarness(expand(runtime.CounterRuntime), { attach: () => ({ textContent: '43', closest: () => ({}) }) });
  try {
    h.mount({ value: 43, label: 'Titles' });
    assert.equal(h.output.props['aria-label'], '43 Titles'); assert.equal(env.observers.length, 0); assert.equal(env.frames.size, 0);
  } finally { h.unmount(); env.restore(); }
});

test('timeline uses chapter thresholds and reaches exactly full progress at its end sentinel', () => {
  const env = environment(), root = {}, values = new Map();
  const chapters = [{ id: 'first' }, { id: 'last-tall-chapter' }], sentinel = { id: 'end' };
  const node = { closest: () => root, querySelectorAll: () => chapters, style: { setProperty: (key, value) => values.set(key, value) } };
  const h = createHarness(expand(runtime.TimelineRuntime), { attach: (_type, props) => props.className === 'editorial-timeline__end' ? sentinel : node });
  try {
    h.mount({ children: 'Timeline content' });
    assert.equal(env.observers[0].options.root === root, true);
    assert.equal(env.observers[0].nodes.has(sentinel), true);
    assert.equal(env.observers[0].options.threshold.length, 21);
    env.observers[0].callback([{ target: chapters[1], isIntersecting: true, intersectionRatio: 0.1 }]);
    assert.equal(Number(values.get('--timeline-progress')) > 0.5, true);
    env.observers[0].callback([{ target: sentinel, isIntersecting: true, intersectionRatio: 1 }]);
    assert.equal(values.get('--timeline-progress'), '1');
    h.unmount(); assert.equal(env.observers[0].stopped, 1);
  } finally { h.unmount(); env.restore(); }
});


test('chapter kicker decode reaches its exact text and a live reduced-motion switch restores it immediately', () => {
  const env = environment(), root = {}, node = { dataset: {}, closest: () => root }, visual = { textContent: '01 · ORIGIN' };
  const h = createHarness(expand(runtime.ChapterRuntime), { attach: type => type === 'section' ? node : visual });
  const props = { id: 'origin', number: '01', kicker: 'ORIGIN', title: 'London-born. MetaWin-built.', children: 'Body' };
  try {
    h.mount(props); assert.equal(node.dataset.editorialState, undefined);
    env.observers[0].callback([{ isIntersecting: true }]);
    assert.equal(node.dataset.editorialState, 'pending'); env.frame(0);
    assert.equal(env.frames.size, 1); env.frame(100); assert.equal(visual.textContent === '01 · ORIGIN', false);
    globalThis.__editorialReduced = true; h.update(props);
    assert.equal(visual.textContent, '01 · ORIGIN'); assert.equal(env.frames.size, 0); assert.equal(node.dataset.editorialState, 'visible');
  } finally { h.unmount(); env.restore(); }
});

test('a window-only scheduling fixture renders static words without calling browser hooks', async () => {
  const savedWindow = globalThis.window, savedDocument = globalThis.document;
  globalThis.window = { requestIdleCallback() {} }; delete globalThis.document;
  const wordsSource = readFileSync(new URL('../HeadlineWords.tsx', import.meta.url), 'utf8');
  const headline = await import(moduleUrl(wordsSource
    .replace("from 'react'", `from '${hooks}'`)
    .replace("from '@/shared/motion/useMotionPreference'", `from '${data('export const useMotionPreference = () => { throw new Error("SSR must not call motion hooks"); };')}'`)
    .replace("from './editorialLifecycle'", `from '${urlOf('features/arena-page/editorialLifecycle.ts')}'`)
    .replace("from './editorialMotion'", `from '${urlOf('features/arena-page/editorialMotion.ts')}'`)));
  try {
    const { renderToStaticMarkup } = require('react-dom/server');
    const html = renderToStaticMarkup(headline.HeadlineWords({ text: 'Small team. Senior hands.', ready: false }));
    assert.match(html, /Small/); assert.doesNotMatch(html, /data-editorial-state/);
  } finally {
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
  }
});

test('headline runtime never prepares before page-ready and reduced motion immediately clears its pending state', async () => {
  const env = environment(), root = {}, node = { dataset: {}, closest: () => root };
  const wordsSource = readFileSync(new URL('../HeadlineWords.tsx', import.meta.url), 'utf8');
  const headline = await import(moduleUrl(wordsSource
    .replace("from 'react'", `from '${hooks}'`)
    .replace("from '@/shared/motion/useMotionPreference'", `from '${data('export const useMotionPreference = () => globalThis.__editorialReduced === true;')}'`)
    .replace("from './editorialLifecycle'", `from '${urlOf('features/arena-page/editorialLifecycle.ts')}'`)
    .replace("from './editorialMotion'", `from '${urlOf('features/arena-page/editorialMotion.ts')}'`)
    .replace('function WordsRuntime(', 'export function WordsRuntime(')));
  const h = createHarness(expand(headline.WordsRuntime), { attach: () => node });
  try {
    h.mount({ text: 'Built to be played hard', ready: false });
    assert.equal(node.dataset.editorialState, undefined); assert.equal(env.observers.length, 0);
    h.update({ text: 'Built to be played hard', ready: true });
    assert.equal(node.dataset.editorialState, 'pending'); assert.equal(env.observers[0].options.root === root, true);
    globalThis.__editorialReduced = true;
    h.update({ text: 'Built to be played hard', ready: true });
    assert.equal(node.dataset.editorialState, 'visible'); assert.equal(env.observers[0].stopped, 1);
    assert.equal(env.observers.length, 1); assert.equal(env.frames.size, 0);
  } finally { h.unmount(); env.restore(); }
});


test('offscreen chapters remain readable past the safety interval and reveal once on their first intersection', () => {
  const env = environment(), root = {}, node = { dataset: {}, closest: () => root }, visual = { textContent: '03 · ENGINE' };
  const h = createHarness(expand(runtime.ChapterRuntime), { attach: type => type === 'section' ? node : visual });
  const props = { id: 'engine', number: '03', kicker: 'ENGINE', title: 'One pipeline, end to end.', children: 'Body' };
  try {
    h.mount(props);
    assert.equal(node.dataset.editorialState, undefined);
    assert.equal(env.observers[0].options.root === root, true);
    assert.equal(env.clock.pending.length, 0);
    env.clock.advance(2200);
    assert.equal(node.dataset.editorialState, undefined); assert.equal(env.frames.size, 0);
    env.observers[0].callback([{ isIntersecting: false }]);
    assert.equal(node.dataset.editorialState, undefined);
    env.observers[0].callback([{ isIntersecting: true }]);
    assert.equal(node.dataset.editorialState, 'pending'); assert.equal(env.frames.size, 1);
    assert.equal(env.clock.pending.length, 1); assert.equal(env.observers[0].stopped, 1);
    env.frame(0); assert.equal(node.dataset.editorialState, 'visible'); assert.equal(env.clock.pending.length, 0);
    env.frame(400); assert.equal(visual.textContent, '03 · ENGINE'); assert.equal(env.frames.size, 0);
    env.observers[0].callback([{ isIntersecting: true }]);
    assert.equal(env.frames.size, 0); assert.equal(node.dataset.editorialState, 'visible');
  } finally { h.unmount(); env.restore(); }
});

test('chapter unmount cancels its pending entry observer, first-frame reveal and safety timer', () => {
  const env = environment(), node = { dataset: {}, closest: () => ({}) }, visual = { textContent: '02 · CRAFT' };
  const props = { id: 'craft', number: '02', kicker: 'CRAFT', title: 'Volatility is a discipline.', children: 'Body' };
  const h = createHarness(expand(runtime.ChapterRuntime), { attach: type => type === 'section' ? node : visual });
  try {
    h.mount(props); h.unmount();
    assert.equal(env.observers[0].stopped, 1); assert.equal(env.clock.pending.length, 0);
    env.observers[0].callback([{ isIntersecting: true }]);
    assert.equal(env.frames.size, 0); assert.equal(node.dataset.editorialState, undefined);
    const entering = createHarness(expand(runtime.ChapterRuntime), { attach: type => type === 'section' ? node : visual });
    entering.mount(props); env.observers[1].callback([{ isIntersecting: true }]);
    assert.equal(env.frames.size, 1); assert.equal(env.clock.pending.length, 1);
    entering.unmount(); assert.equal(env.frames.size, 0); assert.equal(env.clock.pending.length, 0);
    env.clock.advance(2200); assert.equal(node.dataset.editorialState, undefined); assert.equal(visual.textContent, '02 · CRAFT');
  } finally { h.unmount(); env.restore(); }
});
