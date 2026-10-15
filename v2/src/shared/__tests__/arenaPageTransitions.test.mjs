import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { createLoader } from './loadTs.mjs';
import { moduleUrl } from './sourceModule.mjs';
import { createHarness, harnessHooksUrl, findAll } from './hookHarness.mjs';

const require = createRequire(import.meta.url), React = require('react');
const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const hooks = data(`export * from '${pathToFileURL(require.resolve('react')).href}'; export { useState, useRef, useMemo, useCallback, useId, useSyncExternalStore, useEffect, useLayoutEffect } from '${harnessHooksUrl(moduleUrl)}';`);
const source = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const soundStub = data('export const soundEngine = { warpArrival() { globalThis.__pageCues?.push("open"); }, panelClose() { globalThis.__pageCues?.push("close"); }, click() { globalThis.__pageCues?.push("switch"); } };');

test('the engine-free bridge starts immediately, rejects stale arrivals and finishes fallback without a flight', async () => {
  const { createPageTransitionStore } = await createLoader().load('features/arena-page/pageTransitionStore.ts');
  const store = createPageTransitionStore(), changes = [];
  store.subscribe(() => changes.push(store.getSnapshot().phase));
  store.request('about');
  assert.equal(store.getSnapshot().phase, 'settled', 'no WebGL keeps the immediate M2 page');
  store.request(null);
  assert.equal(store.getSnapshot().phase, 'idle');
  store.setAvailable(true);
  store.request('team');
  const first = store.getSnapshot().revision;
  assert.equal(store.getSnapshot().phase, 'flying', 'request publishes motion before the click handler returns');
  store.request('contact');
  store.setPhase('settled', first);
  assert.equal(store.getSnapshot().phase, 'flying', 'an interrupted flight cannot reveal its replacement');
  const current = store.getSnapshot().revision;
  store.setPhase('settled', current);
  store.setScroll(2);
  assert.equal(store.getSnapshot().scrollProgress, 1);
  store.request(null);
  assert.equal(store.getSnapshot().phase, 'closing');
  store.setAvailable(false);
  assert.equal(store.getSnapshot().phase, 'idle', 'lost context cannot strand the modal');
  assert.ok(changes.includes('flying') && changes.includes('closing'));
});

test('a synchronous reduced-motion arrival cuts immediately and preserves the same destination contract', async () => {
  const { createPageTransitionStore } = await createLoader().load('features/arena-page/pageTransitionStore.ts');
  const store = createPageTransitionStore();
  store.setAvailable(true);
  const stop = store.subscribe(() => {
    const state = store.getSnapshot();
    if (state.phase === 'flying' || state.phase === 'closing') store.setPhase(state.targetPage ? 'settled' : 'idle', state.revision);
  });
  store.request('partner');
  assert.equal(store.getSnapshot().phase, 'settled');
  store.request(null);
  assert.equal(store.getSnapshot().phase, 'idle');
  stop();
});

test('section and Client Area controllers retain their dialogs during close, allow interruption, and cue once each way', async () => {
  const { load } = createLoader({ react: hooks, '@/shared/utils/soundEngine': soundStub });
  const { pageTransition: store } = await load('features/arena-page/pageTransitionStore.ts');
  const { useArenaPage } = await load('features/arena-page/useArenaPage.ts');
  const { useClientArea } = await load('features/partner/useClientArea.ts');
  for (const [hook, open, close, value, destination] of [
    [useArenaPage, 'openPage', 'closePage', 'page', 'about'],
    [useClientArea, 'openClientArea', 'closeClientArea', 'clientArea', 'partner'],
  ]) {
    store.setAvailable(true);
    const h = createHarness(hook), opener = { focus() {} };
    const cues = []; globalThis.__pageCues = cues;
    h.mount();
    const openPage = () => destination === 'partner' ? h.output[open](opener) : h.output[open](destination, opener);
    h.act(() => { openPage(); openPage(); });
    assert.equal(store.getSnapshot().targetPage, destination);
    h.act(() => { h.output[close](); h.output[close](); });
    assert.equal(h.output[value], destination === 'partner' ? 'open' : destination, 'the focus owner outlives the return flight');
    assert.equal(store.getSnapshot().phase, 'closing');
    h.act(openPage);
    assert.equal(store.getSnapshot().targetPage, destination, 'a click during return starts a new flight');
    h.act(() => h.output[close]());
    h.act(() => store.setPhase('idle', store.getSnapshot().revision));
    assert.equal(h.output[value], destination === 'partner' ? 'closed' : null);
    assert.deepEqual(cues, ['open', 'close', 'open', 'close']);
    h.unmount(); store.setAvailable(false); delete globalThis.__pageCues;
  }
});

test('the real shell renders live transparent scenery, reveals on arrival, focuses the title and publishes scroll parallax', async () => {
  const focus = [], scrolls = [];
  const { load } = createLoader({ react: hooks,
    'lucide-react': pathToFileURL(require.resolve('lucide-react')).href,
    '@/shared/hooks/useDialogFocus': data('export const useDialogFocus = () => ({ current: null });'),
    '@/features/arena/FlatEmblem': data('export const MiniEmblem = () => null;'),
    '@/features/live-feed/LiveTicker': data('export const LiveTicker = () => null;'),
    '@/shared/ui/SoundToggle': data('export const SoundToggle = () => null;'),
    '@/features/arena/navItems': data('export const NAV_ITEMS = [{short: "About", panelId: "about"}, {short: "Team", panelId: "team"}];'),
    '@/features/arena/topBar.css': data(''), './arenaPage.css': data(''),
  });
  const { pageTransition: store } = await load('features/arena-page/pageTransitionStore.ts');
  const { ArenaPageShell } = await load('features/arena-page/ArenaPageShell.tsx');
  store.setAvailable(true); store.request('about');
  const h = createHarness(ArenaPageShell, { attach: (_type, props) => props.className === 'partner__scroll'
    ? { scrollTo: options => scrolls.push(options), querySelector: () => ({ focus: options => focus.push(options) }) } : {} });
  h.mount({ page: 'about', onClose() {}, returnFocusRef: { current: null }, events: [], isConnected: false,
    children: id => React.createElement('h1', { id, tabIndex: -1 }, 'About') });
  assert.equal(h.output.props['data-scene'], 'live');
  assert.equal(h.output.props['data-flight'], 'flying');
  assert.equal(findAll(h.output, n => n.type === 'img' && n.props.src === '/arena/client-backdrop.svg').length, 0);
  assert.equal(focus.length, 0, 'the invisible travelling title never steals focus');
  h.act(() => store.setPhase('settled', store.getSnapshot().revision));
  assert.equal(h.output.props['data-flight'], 'settled');
  assert.deepEqual(focus, [{ preventScroll: true }]);
  const scroll = findAll(h.output, n => n.props.className === 'partner__scroll')[0];
  h.act(() => scroll.props.onScroll({ currentTarget: { scrollTop: 300, scrollHeight: 1000, clientHeight: 400 } }));
  assert.equal(store.getSnapshot().scrollProgress, 0.5);
  h.act(() => store.setAvailable(false));
  assert.equal(h.output.props['data-scene'], 'fallback');
  assert.equal(findAll(h.output, n => n.type === 'img' && n.props.src === '/arena/client-backdrop.svg').length, 1);
  assert.ok(scrolls.length > 0);
  h.unmount(); store.request(null);
});

test('live content keeps a bounded contrast shade and removes the opaque first-screen fill', () => {
  const css = source('features/arena-page/arenaPage.css');
  assert.match(css, /\[data-scene='live'\][^{]*\{[^}]*background:\s*transparent/s);
  assert.match(css, /\[data-scene='live'\] \.partner__shade[^}]*rgba\(5, 6, 9, 0\.8[0-9]/s);
  assert.match(css, /\[data-flight='flying'\][\s\S]*visibility:\s*hidden/);
  assert.match(css, /\[data-flight='settled'\][\s\S]*partner-body-in/);
  const liveRule = css.match(/\.arena-page\[data-scene='live'\] \{([^}]+)\}/)?.[1] ?? '';
  const muted = liveRule.match(/--color-ice-400:\s*#([\da-f]{6})/i)?.[1] ?? '8294ac';
  const alpha = Number(css.match(/\[data-scene='live'\] \.partner__shade[^}]*rgba\(5, 6, 9, ([\d.]+)\)/)?.[1]);
  const luminance = rgb => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
  const foreground = muted.match(/../g).map(hex => parseInt(hex, 16));
  const background = [5, 6, 9].map(v => v * alpha + 255 * (1 - alpha));
  const contrast = (luminance(foreground) + 0.05) / (luminance(background) + 0.05);
  assert.ok(contrast >= 4.5, `the dimmest copy over a white scene must pass 4.5:1, got ${contrast.toFixed(2)}`);
});

test('homepage copy and the still-mounted mobile drawer cannot show through a transparent page flight', () => {
  const app = source('app/App.tsx');
  assert.match(app, /const topBarCovered = page !== null \|\| clientArea !== 'closed'/);
  assert.match(app, /<main id="main"[^>]*visibility: topBarCovered \? 'hidden' : 'visible'/);
  assert.match(app, /<MobileDrawer[^>]*covered=\{topBarCovered\}/);
  assert.match(app, /<div ref=\{isolationRef\}[^>]*visibility: covered \? 'hidden' : 'visible'/);
});

test('the actual settled-content CSS fits both camera flight budgets and every Partner title can take focus', async () => {
  const { pageFlightTiming } = await createLoader().load('features/arena/pageFlight.ts');
  const css = source('features/arena-page/arenaPage.css');
  const [, titleDuration] = css.match(/animation: partner-title-in (\d+)ms/) ?? [];
  const [, bodyDuration, bodyDelay] = css.match(/animation: partner-body-in (\d+)ms ease-out (\d+)ms/) ?? [];
  for (const [phone, budget] of [[false, 1500], [true, 1200]]) {
    const settled = pageFlightTiming(phone, false).durationMs;
    assert.ok(settled + Number(titleDuration) <= budget, 'the visible heading completes within the click-to-readable budget');
    assert.ok(settled + Number(bodyDuration) + Number(bodyDelay) <= budget, 'the body reveal must fit after the real camera settles');
  }
  for (const file of ['PartnerPage', 'PartnerPending']) {
    assert.ok(/<h1[^>]+tabIndex=\{-1\}/.test(source(`features/partner/${file}.tsx`)), `${file} title accepts programmatic focus`);
  }
});
