// Run with npm run test:unit. The first screen's page (Phase 4 M1), server-rendered from the shipped TSX: the numbers
// come from the shared studio stats (never typed into the page), the headline is one accessible heading made of
// animated letters, and the emblem's slot and the text the constellation doors must avoid are marked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const { load } = createLoader({
  '@/shared/content/SiteContentContext': data("export const useSection = (_name, fallback) => ({ ...fallback, ...(globalThis.__section ?? {}) });"),
  '@/shared/content/StudioStats': data('export const useStudioStats = () => globalThis.__stats;'),
  './BigWinFlash': data('export const BigWinFlash = () => null;'),
  './arenaHero.css': data(''),
});
const { ArenaHero } = await load('features/arena/ArenaHero.tsx');

const render = (stats, props = {}) => {
  globalThis.__stats = stats;
  return renderToStaticMarkup(React.createElement(ArenaHero, props));
};

test('the three numbers are the studio stats, read at render time, and are spoken as one list', () => {
  const markup = render({ games: 41, rtp: 97.2, markets: 9 });
  assert.match(markup, /aria-label="41 games, 97\.2% max RTP, 9 markets"/);
  const other = render({ games: 7, rtp: 96, markets: 3 });
  assert.match(other, /aria-label="7 games, 96% max RTP, 3 markets"/);
  assert.doesNotMatch(markup, /99\.5|\b38\b/, 'no number of the old page is typed into the new one');
});

test('one headline: a single h1 that reads "Built for the arena", its animated letters hidden from assistive tech', () => {
  const markup = render({ games: 1, rtp: 1, markets: 1 });
  assert.equal(markup.match(/<h1\b/g)?.length, 1);
  assert.match(markup, /<h1[^>]*aria-label="Gladiator Studio\. Built for the arena"/);
  const lines = [...markup.matchAll(/<span class="arena-hero__line" aria-hidden="true">(.*?)<\/span><\/span>(?=<span class="arena-hero__line"|<\/h1>)/g)];
  assert.equal(lines.length, 2, 'two lines, each hidden from assistive tech');
  const letters = markup.match(/arena-hero__ch/g)?.length;
  assert.equal(letters, 'Builtfor'.length + 'thearena'.length, 'every letter animates on its own, in order');
  assert.match(markup, /style="--i:0"[^>]*>B</);
  assert.match(markup, /style="--i:7"[^>]*>r</, 'the first line ends on index 7');
  assert.match(markup, /style="--i:9"[^>]*>t</, 'the second line starts after a pause of one letter (the word gap)');
  assert.match(markup, /style="--i:16"[^>]*>a</);
});

test('the emblem slot, the headline and the small print are obstacles for the constellation doors; the slot holds the flat emblem for the no-WebGL case', () => {
  const markup = render({ games: 1, rtp: 1, markets: 1 });
  assert.equal(markup.match(/data-sky-obstacle=""/g)?.length, 3);
  const slot = /<div class="arena-hero__slot"[^>]*>(.*?)<\/div>/.exec(markup);
  assert.ok(slot, 'the slot is rendered');
  assert.match(slot[0], /role="img"/);
  assert.match(slot[0], /aria-label="Gladiator Studio emblem: a helmet between two wings"/);
  assert.match(slot[1], /<svg[^>]*class="arena-hero__flat"/);
  assert.ok((slot[1].match(/<path\b/g) ?? []).length >= 8, 'the helmet and the wings, flat');
});

test('the tagline and its link come from the site content, and the metawin link opens safely', () => {
  globalThis.__section = { tagline: 'A MetaWin Studio (edited)' };
  const markup = render({ games: 1, rtp: 1, markets: 1 });
  delete globalThis.__section;
  assert.match(markup, /A MetaWin Studio \(edited\)/);
  assert.match(markup, /<a href="https:\/\/metawin\.com" target="_blank" rel="noopener noreferrer">metawin\.com<\/a>/);
});

test('the hub dims while a panel is open (data-dimming), and stays an ordinary section otherwise', () => {
  assert.match(render({ games: 1, rtp: 1, markets: 1 }, { target: 'team' }), /<section id="home"[^>]*data-dimming="true"/);
  assert.match(render({ games: 1, rtp: 1, markets: 1 }), /<section id="home"[^>]*data-dimming="false"/);
});
