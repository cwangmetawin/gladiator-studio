import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createLoader } from './loadTs.mjs';
import { moduleUrl } from './sourceModule.mjs';
import { createClock, createHarness, harnessHooksUrl } from './hookHarness.mjs';
import { focusFixture } from './dialogFixture.mjs';

const require = createRequire(import.meta.url), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const hooks = data(`export * from '${pathToFileURL(require.resolve('react')).href}'; export { useState, useRef, useMemo, useCallback, useId, useSyncExternalStore, useEffect, useLayoutEffect } from '${harnessHooksUrl(moduleUrl)}';`);
const pages = { games: ['games/GamesPage', 'GamesPage'], about: ['about/AboutSection', 'AboutSection'],
  team: ['team/TeamSection', 'TeamSection'], journey: ['journey/JourneySection', 'JourneySection'],
  live: ['live-feed/LiveActivityFeed', 'LiveActivityFeed'], careers: ['careers/CareersSection', 'CareersSection'],
  contact: ['contact/ContactSection', 'ContactSection'], partner: ['partner/PartnerArea', 'PartnerArea'] };
const bodyStubs = Object.fromEntries(Object.entries(pages).map(([id, [file, name]]) => [`@/features/${file}`,
  data(`globalThis.__pageBodyEvents.push(['import', '${id}']); export function ${name}() { globalThis.__pageBodyEvents.push(['mount', '${id}']); return null; }`)]));
const infra = { react: hooks, ...bodyStubs,
  'lucide-react': pathToFileURL(require.resolve('lucide-react')).href,
  '@/shared/content/StudioStats': data('export const useStudioStats = () => ({ games: 43, slots: 12, originals: 31, rtp: 97.4, markets: 7, years: 10 });'),
  '@/features/arena/FlatEmblem': data('export const FlatEmblem = () => null;'),
};
const feed = { events: [], isConnected: false };

test('first and later section flights never evaluate a lazy chunk or mount a body before landing', async () => {
  const saved = { window: globalThis.window, events: globalThis.__pageBodyEvents }, clock = createClock();
  globalThis.window = clock; globalThis.__pageBodyEvents = [];
  const { load } = createLoader(infra);
  const { pageTransition: store } = await load('features/arena-page/pageTransitionStore.ts');
  const { ArenaSectionArea } = await load('features/arena-page/ArenaSectionArea.tsx');
  store.setAvailable(true);
  try {
    for (const page of Object.keys(pages).filter(id => id !== 'partner')) {
      for (let visit = 0; visit < 2; visit++) {
        store.request(page);
        const h = createHarness(ArenaSectionArea);
        h.mount({ page, titleId: `${page}-title`, games: [], loading: false, focusGame: null, onPlayGame() {}, feed });
        renderToStaticMarkup(h.output);
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(globalThis.__pageBodyEvents, [], `${page}: no import or body mount inside the flight`);
        h.act(() => clock.advance(2000));
        renderToStaticMarkup(h.output);
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(globalThis.__pageBodyEvents, [], `${page}: even a long or interrupted flight stays empty`);
        h.act(() => store.setPhase('settled'));
        renderToStaticMarkup(h.output);
        assert.deepEqual(globalThis.__pageBodyEvents, [], `${page}: the landing frame itself stays light`);
        h.act(() => clock.advance(100));
        renderToStaticMarkup(h.output);
        await new Promise(resolve => setImmediate(resolve));
        renderToStaticMarkup(h.output);
        assert.ok(globalThis.__pageBodyEvents.some(([event, id]) => event === 'mount' && id === page), `${page}: the real lazy body mounts after landing`);
        globalThis.__pageBodyEvents.length = 0;
        h.act(() => store.request(null));
        renderToStaticMarkup(h.output);
        h.act(() => clock.advance(2000));
        renderToStaticMarkup(h.output);
        assert.deepEqual(globalThis.__pageBodyEvents, [], `${page}: no body remount during the return flight`);
        h.unmount(); store.request(null); store.setPhase('idle');
      }
    }
  } finally {
    store.setAvailable(false); store.request(null);
    if (saved.window === undefined) delete globalThis.window; else globalThis.window = saved.window;
    if (saved.events === undefined) delete globalThis.__pageBodyEvents; else globalThis.__pageBodyEvents = saved.events;
  }
});

test('idle work and chunk warming pause on flight, resume after landing, and dispose pending work', async () => {
  const saved = globalThis.window, clock = createClock(), events = [];
  let nextId = 0;
  const idle = new Map();
  globalThis.window = { ...clock,
    requestIdleCallback(callback) { const id = ++nextId; idle.set(id, callback); return id; },
    cancelIdleCallback(id) { idle.delete(id); },
  };
  const { load } = createLoader({ './pageBodyLoaders': data('') });
  const { pageTransition: store } = await load('features/arena-page/pageTransitionStore.ts');
  const { schedulePageIdleWork } = await load('features/arena-page/pageBodyWork.ts');
  const runIdle = () => { const tasks = [...idle.values()]; idle.clear(); tasks.forEach(run => run()); };
  try {
    store.setAvailable(true);
    const stop = schedulePageIdleWork(() => events.push(store.getSnapshot().phase));
    assert.equal(idle.size, 1);
    store.request('about');
    assert.equal(idle.size, 0, 'click cancels already scheduled imports before the flight starts');
    runIdle(); assert.deepEqual(events, []);
    store.setPhase('settled');
    assert.equal(idle.size, 1);
    store.request('team');
    runIdle(); assert.deepEqual(events, [], 'a page switch cannot reuse an arrival idle task');
    store.setPhase('settled'); runIdle();
    assert.deepEqual(events, ['settled']); stop();
    const cancelled = schedulePageIdleWork(() => events.push('disposed'));
    cancelled(); runIdle(); assert.deepEqual(events, ['settled']);
  } finally {
    store.setAvailable(false); store.request(null);
    if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
  }
});

test('the actual partner gate defers its body through opening, switching and closing, preserving its eager title', async () => {
  const saved = globalThis.window, clock = createClock(); globalThis.window = clock;
  const { load } = createLoader({ react: hooks });
  const { pageTransition: store } = await load('features/arena-page/pageTransitionStore.ts');
  const { PageBodyGate } = await load('features/arena-page/PageBodyGate.tsx');
  let mounts = 0;
  const Body = () => { mounts++; return React.createElement('p', null, 'Partner details'); };
  const h = createHarness(PageBodyGate);
  store.setAvailable(true); store.request('partner');
  h.mount({ page: 'partner', fallback: React.createElement('h1', null, 'Partner title'), children: React.createElement(Body) });
  try {
    assert.match(renderToStaticMarkup(h.output), /Partner title/); assert.equal(mounts, 0);
    h.act(() => clock.advance(2000)); renderToStaticMarkup(h.output); assert.equal(mounts, 0);
    h.act(() => store.setPhase('settled'));
    renderToStaticMarkup(h.output); assert.equal(mounts, 0);
    h.act(() => store.request(null));
    h.act(() => clock.advance(2000)); renderToStaticMarkup(h.output); assert.equal(mounts, 0, 'Escape before idle never mounts details');
    h.act(() => store.request('partner'));
    h.act(() => store.setPhase('settled'));
    h.act(() => clock.advance(100));
    assert.match(renderToStaticMarkup(h.output), /Partner details/); assert.equal(mounts, 1);
    h.act(() => store.request('about'));
    renderToStaticMarkup(h.output); assert.equal(mounts, 1, 'a later flight cannot mount partner details');
  } finally {
    h.unmount(); store.setAvailable(false); store.request(null);
    if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
  }
});

test('Client Area restores its captured opener after the homepage inert/visibility commit', async () => {
  const saved = globalThis.__pageBodyFocus;
  const { load } = createLoader({ react: hooks,
    '@/shared/utils/soundEngine': data('export const soundEngine = { warpArrival() {}, panelClose() {} };') });
  const { pageTransition: store } = await load('features/arena-page/pageTransitionStore.ts');
  const { useClientArea } = await load('features/partner/useClientArea.ts');
  let covered = false, focused = null;
  const opener = { focus() { if (!covered) focused = opener; } };
  const h = createHarness(() => {
    const controller = useClientArea();
    // React applies these attributes in the commit before layout effects run.
    covered = controller.clientArea !== 'closed';
    return controller;
  });
  store.setAvailable(true); h.mount();
  try {
    for (const closeDuringFlight of [true, false]) {
      h.act(() => h.output.openClientArea(opener));
      if (!closeDuringFlight) h.act(() => store.setPhase('settled'));
      focused = { name: 'Close button' };
      h.act(() => h.output.closeClientArea());
      assert.equal(covered, true, 'the opener stays covered during the return flight');
      h.act(() => store.setPhase('idle'));
      assert.equal(covered, false);
      assert.ok(focused === opener, 'closing restores the Client Area button instead of the Skip link');
    }
  } finally {
    h.unmount(); store.setAvailable(false); store.request(null);
    if (saved === undefined) delete globalThis.__pageBodyFocus; else globalThis.__pageBodyFocus = saved;
  }
});

test('partner body replacement transfers an already-focused pending title and preserves visitor control focus', async () => {
  const saved = globalThis.window, clock = createClock(); globalThis.window = clock;
  const f = focusFixture();
  const { load } = createLoader({ react: hooks });
  const { pageTransition: store } = await load('features/arena-page/pageTransitionStore.ts');
  const { PageBodyGate } = await load('features/arena-page/PageBodyGate.tsx');
  const fallback = React.createElement('h1', null, 'Pending title'), body = React.createElement('h1', null, 'Loaded title');
  store.setAvailable(true);
  try {
    for (const movedToControl of [false, true]) {
      let bodyNow = false;
      f.dialog.querySelector = () => bodyNow ? f.last : f.first;
      const h = createHarness(PageBodyGate, { attach: (_type, props) => {
        if (!Object.hasOwn(props, 'data-page-body')) return {};
        const nextBody = props.children === body;
        if (nextBody && !bodyNow && f.doc.activeElement === f.first) f.doc.activeElement = f.doc.body;
        bodyNow = nextBody;
        return f.dialog;
      } });
      store.request('partner');
      h.mount({ page: 'partner', fallback, children: body });
      h.act(() => store.setPhase('settled'));
      f.first.focus();
      if (movedToControl) f.nav.focus();
      h.act(() => clock.advance(100));
      assert.ok(f.doc.activeElement === (movedToControl ? f.nav : f.last), 'a replaced title keeps focus unless the visitor chose a control');
      h.unmount(); store.request(null); store.setPhase('idle');
    }
  } finally {
    store.setAvailable(false); store.request(null); f.restore();
    if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
  }
});

test('late partner Suspense resolution transfers title focus without stealing a chosen control', async () => {
  const saved = globalThis.window, clock = createClock(); globalThis.window = clock;
  const f = focusFixture();
  const { load } = createLoader({ react: hooks });
  const { pageTransition: store } = await load('features/arena-page/pageTransitionStore.ts');
  const { PageBodyGate } = await load('features/arena-page/PageBodyGate.tsx');
  store.setAvailable(true);
  try {
    for (const movedToControl of [false, true]) {
      let title = f.first;
      f.dialog.querySelector = () => title;
      const h = createHarness(PageBodyGate, { attach: () => f.dialog });
      store.request('partner');
      h.mount({ page: 'partner', fallback: React.createElement('h1', null, 'Pending'), children: React.createElement('h1', null, 'Lazy pending') });
      h.act(() => store.setPhase('settled')); f.first.focus();
      h.act(() => clock.advance(100));
      if (movedToControl) f.nav.focus();
      // The module settles later: Suspense commits its replacement without rerendering this gate.
      title = f.last;
      if (!movedToControl) f.doc.activeElement = f.doc.body;
      f.childListChange();
      assert.ok(f.doc.activeElement === (movedToControl ? f.nav : f.last), 'late lazy resolution preserves the same focus intent');
      h.unmount(); store.request(null); store.setPhase('idle');
    }
  } finally {
    store.setAvailable(false); store.request(null); f.restore();
    if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
  }
});

test('a warm import that resolves during a flight cannot mount details or start the next warm chunk', async () => {
  const saved = Object.fromEntries(['window', '__warmEvents', '__warmPhase', '__warmResolve', '__warmPending'].map(key => [key, globalThis[key]]));
  const clock = createClock(); globalThis.window = clock; globalThis.__warmEvents = [];
  globalThis.__warmPending = new Promise(resolve => { globalThis.__warmResolve = resolve; });
  const chunks = Object.fromEntries(Object.entries(pages).map(([id, [file, name]]) => [`@/features/${file}`, data(`
    globalThis.__warmEvents.push(['start', '${id}', globalThis.__warmPhase()]);
    ${id === 'games' ? 'await globalThis.__warmPending;' : ''}
    globalThis.__warmEvents.push(['evaluated', '${id}', globalThis.__warmPhase()]);
    export function ${name}() { globalThis.__warmEvents.push(['mount', '${id}', globalThis.__warmPhase()]); return null; }
  `)]));
  const { load } = createLoader({ ...infra, ...chunks });
  const { pageTransition: store } = await load('features/arena-page/pageTransitionStore.ts');
  globalThis.__warmPhase = () => store.getSnapshot().phase;
  const { schedulePageBodyWarmup } = await load('features/arena-page/pageBodyLoaders.ts');
  const { ArenaSectionArea } = await load('features/arena-page/ArenaSectionArea.tsx');
  const h = createHarness(ArenaSectionArea);
  store.setAvailable(true);
  const stop = schedulePageBodyWarmup();
  try {
    clock.advance(100); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(globalThis.__warmEvents, [['start', 'games', 'idle']]);
    store.request('games');
    h.mount({ page: 'games', titleId: 'games-title', games: [], loading: false, focusGame: null, onPlayGame() {}, feed });
    globalThis.__warmResolve(); await new Promise(resolve => setImmediate(resolve));
    h.act(() => clock.advance(2000)); renderToStaticMarkup(h.output);
    assert.deepEqual(globalThis.__warmEvents, [['start', 'games', 'idle'], ['evaluated', 'games', 'flying']],
      'native evaluation can finish in flight, while body mounts and subsequent imports remain excluded');
    h.act(() => store.setPhase('settled'));
    h.act(() => clock.advance(100));
    renderToStaticMarkup(h.output); await new Promise(resolve => setImmediate(resolve)); renderToStaticMarkup(h.output);
    assert.ok(globalThis.__warmEvents.some(([event, id, phase]) => event === 'mount' && id === 'games' && phase === 'settled'));
    assert.ok(globalThis.__warmEvents.filter(([event]) => event === 'start').every(([, , phase]) => phase !== 'flying' && phase !== 'closing'));
  } finally {
    stop(); h.unmount(); store.setAvailable(false); store.request(null);
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
