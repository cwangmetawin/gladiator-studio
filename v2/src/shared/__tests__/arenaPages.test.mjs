// Real shipped TSX and hooks; only data, sound output and the browser boundary are replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createLoader } from './loadTs.mjs';
import { moduleUrl } from './sourceModule.mjs';
import { createHarness, harnessHooksUrl, findAll, textOf } from './hookHarness.mjs';
import { focusFixture } from './dialogFixture.mjs';

const require = createRequire(import.meta.url), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const src = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const json = name => JSON.parse(src(`api/${name}Default.json`));
const stats = { games: 43, slots: 12, originals: 31, rtp: 97.4, markets: 7, years: 10 };
const hooks = data(`export * from '${pathToFileURL(require.resolve('react')).href}'; export { default } from '${pathToFileURL(require.resolve('react')).href}'; export { useState, useRef, useMemo, useCallback, useId, useSyncExternalStore, useEffect, useLayoutEffect } from '${harnessHooksUrl(moduleUrl)}';`);
const infra = {
  'lucide-react': pathToFileURL(require.resolve('lucide-react')).href,
  'framer-motion': pathToFileURL(require.resolve('framer-motion')).href,
  '@/shared/content/SiteContentContext': data('export const useSection = (_key, fallback) => fallback;'),
  '@/shared/content/StudioStats': data(`export const useStudioStats = () => (${JSON.stringify(stats)});`),
  '@/shared/utils/soundEngine': data('export const soundEngine = { subscribeMute: () => () => {}, isMuted: () => false, click() {}, hover() {}, transmission() {}, alert() {} };'),
  '@/shared/constants/urls': data('export const CONTACT = { email: "cwang@metawin.inc", phone: "+44 20 0000 0000", location: "London" };'),
  '@/lib/supabase': data('export const supabase = { functions: { invoke: (...args) => globalThis.__enquiry(...args) } };'),
  './liveCatalogue': data('export const lookupGame = () => undefined;'),
  '@/features/arena/topBar.css': data(''), './arenaPage.css': data(''), './partner.css': data(''),
};
for (const name of ['about', 'team', 'journey', 'careers', 'partner']) infra[`@/api/${name}Default.json`] = data(`export default ${JSON.stringify(json(name))};`);
const feed = { events: [], isConnected: false, eventsPerSecond: 0, totalAmount: 0,
  gladiatorCount: 0, originalCount: 0, gladiatorTotal: 0, originalTotal: 0 };
const pages = { games: ['games/GamesPage.tsx', 'GamesPage'], about: ['about/AboutSection.tsx', 'AboutSection'],
  team: ['team/TeamSection.tsx', 'TeamSection'], journey: ['journey/JourneySection.tsx', 'JourneySection'],
  live: ['live-feed/LiveActivityFeed.tsx', 'LiveActivityFeed'], careers: ['careers/CareersSection.tsx', 'CareersSection'],
  contact: ['contact/ContactSection.tsx', 'ContactSection'] };

for (const [page, [file, name]] of Object.entries(pages)) {
  test(`${page} renders its real content in the shared named arena dialog`, async () => {
    const { load } = createLoader(infra);
    const { ArenaPageShell } = await load('features/arena-page/ArenaPageShell.tsx');
    const Component = (await load(`features/${file}`))[name];
    const html = renderToStaticMarkup(React.createElement(ArenaPageShell,
      { page, onClose() {}, onNavigate() {}, returnFocusRef: { current: null }, ...feed },
      titleId => React.createElement(Component, { titleId, games: [], loading: false, onPlayGame() {}, ...feed })));
    const titleId = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(titleId);
    assert.ok(html.includes(`<h1 id="${titleId}"`));
    assert.match(html, /class="partner__title"/);
    assert.match(html, /class="partner__emblem"/);
    assert.match(html, /src="\/arena\/client-backdrop.svg"/);
    assert.match(html, /<header class="topbar partner__bar"/);
    assert.match(html, /role="dialog" aria-modal="true"/);
    assert.match(html, new RegExp(`aria-current="page"[^>]*>${page === 'live' ? 'Live' : page[0].toUpperCase() + page.slice(1)}`));
    assert.doesNotMatch(html, /class="(?:card|glass)(?:\s|")|<canvas|opacity:0/);
  });
}

test('the shared frame switches in place, resets only its scroll and focuses the committed title', async () => {
  const focus = [], scrolls = [], navigations = [], closes = [];
  const title = { focus: options => focus.push(options) };
  const { load } = createLoader({ ...infra, react: hooks,
    '@/shared/hooks/useDialogFocus': data('export const useDialogFocus = () => ({ current: null });') });
  const { ArenaPageShell } = await load('features/arena-page/ArenaPageShell.tsx');
  const h = createHarness(ArenaPageShell, { attach: (_type, props) => props.className === 'partner__scroll'
    ? { scrollTo: options => scrolls.push(options), querySelector: () => title } : {} });
  const props = { page: 'about', onNavigate: id => navigations.push(id), onClose: () => closes.push(1),
    returnFocusRef: { current: null }, ...feed, children: id => React.createElement('h1', { id }, 'About') };
  h.mount(props);
  const link = findAll(h.output, n => n.type === 'a' && n.props.href === '#team')[0];
  assert.ok(link);
  h.act(() => link.props.onClick({ preventDefault() {} }));
  assert.deepEqual(navigations, ['team']);
  assert.deepEqual(closes, []);
  h.update({ ...props, page: 'team' });
  assert.deepEqual(scrolls.at(-1), { top: 0, left: 0, behavior: 'instant' });
  assert.deepEqual(focus.at(-1), { preventScroll: true });
  const close = findAll(h.output, n => n.type === 'button' && textOf(n).includes('Close'))[0];
  h.act(() => close.props.onClick());
  assert.deepEqual(closes, [1]);
  assert.match(src('features/arena-page/ArenaPageShell.tsx'), /onEscape: onClose/);
  h.unmount();
});

test('cold section details never suspend the real title or emblem, and the lazy body does not duplicate the hero', async () => {
  const { load } = createLoader(infra);
  const { ArenaSectionArea } = await load('features/arena-page/ArenaSectionArea.tsx');
  for (const page of Object.keys(pages)) {
    const html = renderToStaticMarkup(React.createElement(ArenaSectionArea, { page, titleId: `${page}-title`,
      games: [], loading: true, focusGame: null, onPlayGame() {}, feed }));
    assert.equal(html.match(/<h1\b/g)?.length, 1);
    assert.ok(html.includes(`<h1 id="${page}-title"`));
    assert.match(html, /class="partner__emblem"/);
    assert.match(html, /Loading details/);
    assert.doesNotMatch(html, /opacity:0/);
  }
  const route = src('features/arena-page/ArenaSectionArea.tsx');
  assert.equal(route.match(/titleId=\{titleId\} bodyOnly\b/g)?.length, 7);
});

test('the real shell and modal manager consume Escape and Close, trap focus and return it with one cue each way', async () => {
  const f = focusFixture(), cues = [];
  const previous = globalThis.__pageSound;
  globalThis.__pageSound = cue => cues.push(cue);
  const { load } = createLoader({ ...infra, react: hooks,
    '@/shared/utils/soundEngine': data('export const soundEngine = Object.fromEntries(["warpArrival", "panelClose", "click"].map(name => [name, () => globalThis.__pageSound(name)]));') });
  const { useArenaPage } = await load('features/arena-page/useArenaPage.ts');
  const { ArenaPageShell } = await load('features/arena-page/ArenaPageShell.tsx');
  const controller = createHarness(useArenaPage); controller.mount();
  let shell;
  try {
    for (const action of ['escape', 'close']) {
      f.opener.focus();
      controller.act(() => controller.output.openPage('about', f.opener));
      shell = createHarness(ArenaPageShell, { attach: (_type, props) => {
        if (props.className === 'partner__scroll') return { scrollTo() {}, querySelector: () => f.last };
        if (props.className === 'topbar__client') return f.first;
        return f.dialog;
      } });
      shell.mount({ page: 'about', onClose: () => controller.act(() => controller.output.closePage()),
        returnFocusRef: controller.output.openerRef, ...feed, children: id => React.createElement('h1', { id }, 'About') });
      assert.equal(f.nav.inert, true);
      assert.equal(f.doc.activeElement === f.last, true);
      f.nav.focus(); assert.equal(f.dialog.contains(f.doc.activeElement), true, 'background focus cannot escape the modal');
      assert.equal(f.key('Tab').defaultPrevented, true);
      if (action === 'escape') assert.equal(f.key('Escape').defaultPrevented, true);
      else findAll(shell.output, n => n.type === 'button' && textOf(n).includes('Close'))[0].props.onClick();
      assert.equal(controller.output.page, null);
      shell.unmount(); shell = null;
      assert.equal(f.doc.activeElement === f.opener, true);
      assert.equal(f.nav.inert, false);
    }
    assert.deepEqual(cues, ['warpArrival', 'panelClose', 'warpArrival', 'panelClose']);
  } finally {
    shell?.unmount(); controller.unmount(); f.restore();
    if (previous === undefined) delete globalThis.__pageSound; else globalThis.__pageSound = previous;
  }
});

test('the page controller retains the original opener and emits one open, switch and close cue', async () => {
  const calls = [], focused = [];
  globalThis.__pageSound = name => calls.push(name);
  const { load } = createLoader({ react: hooks,
    '@/shared/utils/soundEngine': data('export const soundEngine = Object.fromEntries(["warpArrival", "panelClose", "click"].map(name => [name, () => globalThis.__pageSound(name)]));') });
  try {
    const { useArenaPage } = await load('features/arena-page/useArenaPage.ts');
    const h = createHarness(useArenaPage);
    const opener = { focus: options => focused.push(options) }, other = { focus() { throw Error('opener replaced'); } };
    h.mount();
    h.act(() => h.output.closePage());
    h.act(() => { h.output.openPage('about', opener); h.output.openPage('about', other); });
    assert.equal(h.output.page, 'about');
    assert.equal(h.output.openerRef.current === opener, true);
    h.act(() => h.output.openPage('team', other));
    assert.equal(h.output.page, 'team');
    assert.equal(h.output.openerRef.current === opener, true);
    h.act(() => { h.output.closePage(); h.output.closePage(); });
    assert.equal(h.output.page, null);
    assert.deepEqual(calls, ['warpArrival', 'click', 'panelClose']);
    assert.deepEqual(focused, [{ preventScroll: true }, { preventScroll: true }], 'restore after React makes the homepage trigger visible again');
    h.unmount();
  } finally { delete globalThis.__pageSound; }
});

test('clearing a game destination never reuses a handled request number', async () => {
  const { load } = createLoader({ react: hooks,
    '@/shared/utils/soundEngine': data('export const soundEngine = { warpArrival() {}, panelClose() {}, click() {} };') });
  const { useArenaPage } = await load('features/arena-page/useArenaPage.ts');
  const h = createHarness(useArenaPage); h.mount();
  try {
    h.act(() => h.output.openPage('games', { focus() {} }, 'Alpha'));
    const first = h.output.focusGame.request;
    h.act(() => h.output.openPage('games'));
    assert.equal(h.output.focusGame, null);
    h.act(() => h.output.openPage('games', undefined, 'Alpha'));
    assert.ok(h.output.focusGame.request > first, 'a still-mounted catalogue must see a new destination request');
  } finally { h.unmount(); }
});

test('Client Area delegates its unaltered content and bar to the same shell', async () => {
  const { load } = createLoader(infra);
  const { PartnerDialog } = await load('features/partner/PartnerDialog.tsx');
  const { PartnerPage } = await load('features/partner/PartnerPage.tsx');
  const html = renderToStaticMarkup(React.createElement(PartnerDialog, { onClose() {}, returnFocusRef: { current: null }, ...feed },
    titleId => React.createElement(PartnerPage, { titleId, content: json('partner'), stats, catalogue: [], coversReady: true })));
  assert.match(src('features/partner/PartnerDialog.tsx'), /ArenaPageShell/);
  assert.match(html, /Partners/);
  assert.match(html, /class="partner__title"/);
  assert.match(html, /client-backdrop.svg/);
  assert.doesNotMatch(html, /aria-label="Sections"/);
  const css = src('features/arena-page/arenaPage.css');
  assert.match(css, /font-family:\s*'Saira Title'/);
  assert.match(css, /clamp\(96px,/);
  assert.match(css, /clamp\(44px,/);
  assert.match(css, /partner-in 280ms/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('contact keeps the exact send-enquiry payload, honeypot, validation, draft and delivery states', async () => {
  assert.match(src('features/contact/ContactSection.tsx'), /ArenaPageContent/);
  const saved = { sessionStorage: globalThis.sessionStorage, document: globalThis.document };
  const calls = [], focus = [], store = new Map();
  globalThis.sessionStorage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  globalThis.document = { getElementById: id => ({ focus: () => focus.push(id) }) };
  let response = { data: { ok: true, stored: true } };
  globalThis.__enquiry = async (...args) => { calls.push(args); return response; };
  try {
    const { load } = createLoader({ ...infra, react: hooks });
    const { ContactSection } = await load('features/contact/ContactSection.tsx');
    const h = createHarness(ContactSection); h.mount({ titleId: 'contact-title' });
    const form = () => findAll(h.output, n => typeof n.props?.onSubmit === 'function')[0];
    await form().props.onSubmit({ preventDefault() {} }); h.act(() => {});
    assert.deepEqual(focus, ['contact-name']); assert.equal(calls.length, 0);
    const values = { name: 'Alex', company: 'Studio', email: 'alex@example.com', enquiryType: 'Game Integration', message: 'Hello', website: 'bot-trap' };
    for (const [name, value] of Object.entries(values)) h.act(() => findAll(h.output, n => n.props?.name === name)[0].props.onChange({ target: { value } }));
    const honeypot = findAll(h.output, n => n.props?.name === 'website')[0];
    assert.equal(honeypot.props.tabIndex, -1); assert.equal(honeypot.props['aria-hidden'], 'true');
    response = { error: {}, response: { status: 422, json: async () => ({ error: 'Check fields' }) } };
    await form().props.onSubmit({ preventDefault() {} }); h.act(() => {});
    assert.deepEqual(calls[0], ['send-enquiry', { body: values }]);
    assert.ok(textOf(h.output).includes('Check fields'));
    assert.equal(JSON.parse(store.get('contact-draft')).message, 'Hello');
    assert.ok(!textOf(h.output).includes('Use email app'));
    response = { data: { ok: true, stored: true } };
    await form().props.onSubmit({ preventDefault() {} }); h.act(() => {});
    assert.ok(textOf(h.output).includes('Enquiry received')); assert.equal(store.has('contact-draft'), false);
    h.unmount();
  } finally {
    delete globalThis.__enquiry;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});

test('removed panel, carousel, camera flights and planet assets cannot return to runtime or admin imports', () => {
  for (const path of ['shared/motion/ContentPanel.tsx', 'features/games/GameCoverflow.tsx', 'features/starfield/planetSurfaces.ts']) {
    assert.equal(existsSync(new URL(`../../${path}`, import.meta.url)), false, path);
  }
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
    return entry.isDirectory() ? entry.name === '__tests__' ? [] : walk(path) : /\.(tsx?|css|json)$/.test(entry.name) ? [path] : [];
  });
  for (const path of walk(new URL('../../', import.meta.url))) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /(?:from|import\()[^\n]*(?:shared\/motion\/ContentPanel|GameCoverflow|planetSurfaces)|\/textures\/(?:planet_|earth_|saturn_)/, path.pathname);
  }
  assert.doesNotMatch(src('features/starfield/StarfieldBackground.tsx'), /navPlanets|sunGlow|activePanelLight|buildDistantPlanets|panelCameraPose/);
});
