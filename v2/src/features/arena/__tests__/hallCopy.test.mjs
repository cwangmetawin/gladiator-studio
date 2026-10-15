import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const { HallCopy } = await load('features/arena/HallCopy.tsx');
const { playDetail, openAllGames } = await load('features/arena/hallActions.ts');
const { coverForGame } = await load('features/arena/hallManifest.ts');
const require = createRequire(import.meta.url), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const games = [
  { id: 1, title: 'Eyes of Medusa', image: '/medusa.webp', link: 'https://games.example/medusa', category: 'slot', timeline: '2025-12-01', genre: 'Mythology', rtp: 94.23, volatility: 'HIGH' },
  { id: 2, title: 'Legend of Tartarus', image: '/tartarus.webp', link: 'https://games.example/tartarus', category: 'slot', timeline: '', genre: '' },
];
const props = extra => ({ games, index: 0, total: 41, visible: true, activated: true, rendered: false,
  cover: coverForGame(games[0], null, false), rootRef: null, onSelect: () => {}, onPlay: () => {}, ...extra });
const findAll = (node, type) => !node || typeof node !== 'object' ? [] : Array.isArray(node)
  ? node.flatMap(child => findAll(child, type)) : [...(node.type === type ? [node] : []), ...findAll(node.props?.children, type)];

test('the hall copy shows catalogue-only facts, current index/genre/month, a live title, focusable ticks and the existing two actions', () => {
  const markup = renderToStaticMarkup(React.createElement(HallCopy, props()));
  for (const text of ['Eyes of Medusa', '01 / 02', 'Mythology', 'Dec 2025', '94.23%', 'HIGH', 'Slot', 'All 41 games', 'Play demo']) assert.ok(markup.includes(text), text);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /aria-current="true"/);
  assert.equal(markup.match(/<button\b/g).length, 4, 'two ticks and two actions');
  assert.equal(markup.match(/<img\b/g).length, 1, 'one static cover for unavailable/loading WebGL');
  assert.doesNotMatch(markup, /<canvas|<iframe|96\.5|97%/);
  const missing = renderToStaticMarkup(React.createElement(HallCopy, props({ index: 1, cover: coverForGame(games[1], null, false) })));
  assert.doesNotMatch(missing, /RTP|Volatility|Dec 2025|94\.23/);
  assert.match(missing, /Legend of Tartarus/);
});

test('ticks and Play demo use the current game and focus the opener before invoking the shared player callback', () => {
  let selected = -1, played = null;
  const order = [];
  const tree = HallCopy(props({ index: 1, onSelect: index => { selected = index; }, onPlay: game => { order.push('play'); played = game; } }));
  const buttons = findAll(tree, 'button');
  const event = { currentTarget: { focus: options => { assert.equal(options.preventScroll, true); order.push('focus'); } } };
  buttons.find(b => b.props['aria-label'] === 'Show Eyes of Medusa').props.onClick();
  assert.equal(selected, 0);
  buttons.find(b => b.props.className.includes('hall-play')).props.onClick(event);
  assert.equal(played === games[1], true);
  assert.deepEqual(order, ['focus', 'play']);
  assert.deepEqual(playDetail(games[1]), { title: games[1].title, link: games[1].link });
  for (const link of ['', 'javascript:alert(1)', 'http://games.example/demo']) assert.equal(playDetail({ ...games[0], link }), null);
});

test('All games retains the existing open-panel request and opener focus; hidden/covered copy is inert and first-screen copy requests no covers', () => {
  const previous = globalThis.window, events = [], order = [];
  globalThis.window = { dispatchEvent: event => { events.push(event); order.push('request'); } };
  try {
    openAllGames({ focus: options => { assert.equal(options.preventScroll, true); order.push('focus'); } });
    assert.deepEqual(order, ['focus', 'request']);
    assert.equal(events[0].type, 'open-panel'); assert.equal(events[0].detail, 'games');
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
  const hidden = renderToStaticMarkup(React.createElement(HallCopy, props({ visible: false, activated: false })));
  assert.match(hidden, /inert=""/); assert.match(hidden, /aria-hidden="true"/);
  assert.doesNotMatch(hidden, /<img/);
  const ready = renderToStaticMarkup(React.createElement(HallCopy, props({ rendered: true })));
  assert.doesNotMatch(ready, /<img/);
});

test('an intentionally empty published roster has a readable catalogue action, no phantom game and no Play demo', () => {
  const markup = renderToStaticMarkup(React.createElement(HallCopy, props({ games: [], cover: null, total: 0 })));
  assert.match(markup, /The arena/); assert.match(markup, /All 0 games/);
  assert.doesNotMatch(markup, /Play demo|<img|RTP|01 \/ 00/);
});
