import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createLoader } from './loadTs.mjs';
import { moduleUrl } from './sourceModule.mjs';
import { createHarness, harnessHooksUrl, findAll, textOf } from './hookHarness.mjs';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const hooks = data(`export * from '${pathToFileURL(require.resolve('react')).href}'; export { useState, useMemo, useRef, useEffect } from '${harnessHooksUrl(moduleUrl)}';`);
const games = [
  { id: 1, title: 'Alpha', slug: 'alpha', category: 'slot', timeline: '2026-01', genre: 'Edited genre', rtp: 95.83, image: 'https://cdn.example/alpha.webp', link: 'https://demo.example/alpha', description: 'Edited description', isHot: true },
  { id: 2, title: 'Beta', slug: 'beta', category: 'mini', timeline: '2026-02', rtp: 97, link: 'https://demo.example/beta' },
  { id: 3, title: 'Unsafe', category: 'slot', timeline: '2026-03', rtp: 0, link: 'javascript:alert(1)' },
];

test('the real catalogue filters the whole roster, focuses late/repeated requests, uses baked art and launches the same demo payload', async () => {
  const saved = { __covers: globalThis.__covers, __phone: globalThis.__phone };
  const clicks = [], focus = [], plays = [];
  const { load } = createLoader({ react: hooks,
    '@/features/partner/usePartnerCovers': data('export const usePartnerCovers = () => globalThis.__covers;'),
    '@/shared/hooks/useIsMobile': data('export const useIsMobile = () => !!globalThis.__phone;'),
    '@/shared/motion/useMotionPreference': data('export const useMotionPreference = () => true;'),
    '@/shared/utils/soundEngine': data('export const soundEngine = { click: () => globalThis.__catalogueClick() };'),
  });
  globalThis.__catalogueClick = () => clicks.push(1);
  globalThis.__covers = { ready: false, manifest: null };
  globalThis.__phone = false;
  const { GamesPage } = await load('features/games/GamesPage.tsx');
  const { parseCoverManifest } = await load('features/arena/hallManifest.ts');
  let h;
  try {
    h = createHarness(GamesPage, { attach: () => ({ querySelectorAll: () => findAll(h.output, n => n.props?.['data-game-key']).map(n => ({
      dataset: { gameKey: n.props['data-game-key'] }, scrollIntoView: options => focus.push(['scroll', n.props['data-game-key'], options]),
      focus: options => focus.push(['focus', n.props['data-game-key'], options]),
    })) }) });
    const props = { titleId: 'games-title', games, loading: true, onPlayGame: game => plays.push(game) };
    const rows = () => findAll(h.output, n => n.props?.['data-game-key']);
    const filter = name => findAll(h.output, n => n.type === 'button' && textOf(n) === name)[0];
    h.mount(props);
    assert.equal(rows().length, 3, 'all categories are immediately present while the catalogue updates');
    assert.equal(findAll(h.output, n => n.type === 'img').length, 0, 'wait for the baked manifest before original art');
    assert.ok(textOf(h.output).includes('Edited genre')); assert.ok(textOf(h.output).includes('95.83%'));
    assert.ok(textOf(h.output).includes('RTP 0%'));
    h.act(() => filter('Originals').props.onClick()); assert.equal(rows().length, 1);
    h.act(() => filter('Hot').props.onClick()); assert.equal(rows().length, 1); assert.equal(rows()[0].props['data-game-key'], 'alpha');
    h.act(() => filter('Originals').props.onClick());
    h.update({ ...props, focusGame: { title: 'alpha', request: 1 } });
    assert.deepEqual(focus.slice(-2), [['scroll', 'alpha', { behavior: 'instant', block: 'center', inline: 'nearest' }], ['focus', 'alpha', { preventScroll: true }]]);
    const widths = Object.fromEntries([320, 640].map(width => [width, { url: `/arena/games/alpha-${width}-0123abcd.webp`, width, height: width * 1.5, bytes: 10 }]));
    globalThis.__covers = { ready: true, manifest: parseCoverManifest({ version: 1, entries: { alpha: { source: games[0].image, primary: [0.1, 0.2, 0.3], secondary: [0.2, 0.3, 0.4], widths } } }) };
    h.update({ ...props, loading: false, focusGame: { title: 'alpha', request: 1 } });
    let image = findAll(h.output, n => n.type === 'img')[0]; assert.equal(image.props.src, '/arena/games/alpha-640-0123abcd.webp');
    globalThis.__phone = true; h.act(() => {});
    image = findAll(h.output, n => n.type === 'img')[0]; assert.equal(image.props.src, '/arena/games/alpha-320-0123abcd.webp');
    const broken = { dataset: {}, hidden: false };
    image.props.onError({ currentTarget: broken }); assert.equal(broken.src, games[0].image);
    image.props.onError({ currentTarget: broken }); assert.equal(broken.hidden, true);
    const play = findAll(h.output, n => n.props?.['aria-label'] === 'Play demo: Alpha')[0];
    h.act(() => play.props.onClick()); assert.deepEqual(plays, [{ title: 'Alpha', link: 'https://demo.example/alpha' }]);
    assert.equal(findAll(h.output, n => n.props?.['aria-label'] === 'Play demo: Unsafe').length, 0);
    const handled = focus.length;
    h.act(() => filter('Originals').props.onClick()); assert.equal(focus.length, handled, 'manual filters remain usable after a focus request');
    h.update({ ...props, loading: false, focusGame: { title: 'Alpha', request: 2 } }); assert.ok(focus.length > handled, 'another request for the same game is not lost');
    h.update({ ...props, games: [], loading: false }); assert.ok(textOf(h.output).includes('New titles are on the way.'));
    assert.ok(clicks.length > 0);
  } finally {
    h?.unmount(); delete globalThis.__catalogueClick;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});

test('Live renders updated events and totals from its feeder props, caps both lists and retains the session record', async () => {
  const { load } = createLoader({ react: hooks, './liveCatalogue': data('export const lookupGame = () => undefined;') });
  const { LiveActivityFeed } = await load('features/live-feed/LiveActivityFeed.tsx');
  const events = Array.from({ length: 80 }, (_, i) => ({ id: `${i}`, gameName: `Game ${i}`, amount: i + 10,
    provider: i % 2 ? 'original' : 'gladiator', country: 'GB' }));
  const props = { titleId: 'live-title', events, isConnected: true, eventsPerSecond: 12, totalAmount: 1500,
    gladiatorCount: 40, originalCount: 40, gladiatorTotal: 700, originalTotal: 800 };
  const h = createHarness(LiveActivityFeed); h.mount(props);
  try {
    let html = renderToStaticMarkup(h.output);
    assert.equal(html.match(/<li>/g)?.length, 30, '15 rows per provider, independent of socket window size');
    assert.match(html, /Game 79/); assert.match(html, /Online/); assert.match(html, /\$1.5K/);
    h.update({ ...props, events: [{ ...events[0], gameName: 'New incoming win' }], isConnected: false });
    html = renderToStaticMarkup(h.output);
    assert.match(html, /New incoming win/); assert.match(html, /Game 79/); assert.match(html, /Offline/);
    assert.doesNotMatch(html, /class="card|<canvas/);
  } finally { h.unmount(); }
});
