// Mutation flags alter isolated in-memory source fixtures, never the worktree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleUrl } from './sourceModule.mjs';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const read = file => readFileSync(join(SRC, file), 'utf8');
let copySource = read('features/arena-page/pageCopy.ts');
if (process.env.MUTATE_EDITORIAL_COPY === '1') copySource = copySource.replace('Built to be played hard', 'Game Catalogue');
const { ARENA_PAGE_COPY } = await import(moduleUrl(copySource));
let catalogueSource = read('shared/utils/catalogueText.ts');
if (process.env.MUTATE_EDITORIAL_DESCRIPTOR_COUNT === '1') {
  assert.equal(catalogueSource.includes('return text'), true, 'catalogue interpolation mutation target');
  catalogueSource = catalogueSource.replace('return text', 'return text.includes("battle-tested") ? text : text');
}
const { withCatalogueCounts } = await import(moduleUrl(catalogueSource));
const expected = {
  games: { eyebrow: 'Catalogue', title: 'Built to be played hard', lede: '{{games}} titles across Gladiator slots and MetaWin Originals. Ultra volatility, provably fair, ready for any lobby.' },
  about: { eyebrow: 'About', title: 'The studio inside MetaWin', lede: 'We design, build and run the games behind the world’s leading crypto casino — maths, rendering and live ops under one roof.' },
  team: { eyebrow: 'Team', title: 'Small team. Senior hands.', lede: 'Game maths, real-time rendering, distributed systems and crypto product — the people behind titles played every day.' },
  journey: { eyebrow: 'Journey', title: 'The road so far', lede: 'From a London founding to {{games}} live titles in {{markets}} markets.' },
  live: { eyebrow: 'Live', title: 'Wins, as they land', lede: 'Every win across Gladiator and MetaWin Originals, the moment it settles.' },
  careers: { eyebrow: 'Careers', title: 'Ship games people play tonight', lede: 'A small, senior team building the games behind MetaWin. We hire for craft, move fast and release to production constantly.' },
  contact: { eyebrow: 'Contact', title: 'Bring your lobby into the arena', lede: 'Operators, aggregators and platform partners — tell us what you need. We reply within one business day.' },
};

test('every published arena eyebrow, headline and lede matches the M5 copy sheet exactly', () => {
  assert.equal(Object.keys(ARENA_PAGE_COPY).sort().join(','), Object.keys(expected).sort().join(','));
  for (const [page, fields] of Object.entries(expected)) {
    for (const [field, value] of Object.entries(fields)) assert.equal(ARENA_PAGE_COPY[page][field], value, `${page}.${field}`);
  }
});

test('the Client Area code default matches the console copy without changing its contact address', () => {
  const partner = JSON.parse(read('api/partnerDefault.json'));
  if (process.env.MUTATE_EDITORIAL_PARTNER_COPY === '1') partner.title = 'Integrate Gladiator Studio';
  assert.equal(partner.eyebrow, 'Client Area');
  assert.equal(partner.title, 'Partner console');
  assert.equal(partner.lede, 'Docs, sandbox keys, game assets and certificates — everything your integration team needs, behind one gate.');
  assert.equal(partner.contactEmail, 'cwang@metawin.inc');
});

test('catalogue placeholders resolve before descriptors without losing singular title grammar', () => {
  const copy = 'Operators and aggregators get {{games}} battle-tested titles, one API, real-time bet data and a team that answers.';
  assert.equal(withCatalogueCounts(copy, { games: 43, slots: 12, originals: 31 }), 'Operators and aggregators get 43 battle-tested titles, one API, real-time bet data and a team that answers.');
  assert.equal(withCatalogueCounts('{{games}} titles', { games: 1, slots: 1, originals: 0 }), '1 title');
  assert.equal(withCatalogueCounts('{{games}} live titles', { games: 1, slots: 1, originals: 0 }), '1 live title');
});

function copyFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : copyFiles(file);
    return /\.(?:tsx?|json)$/.test(file) ? [{ file: relative(SRC, file), text: readFileSync(file, 'utf8') }] : [];
  });
}
const copies = copyFiles(SRC);
if (process.env.MUTATE_EDITORIAL_PHRASE === '1') copies.push({ file: 'mutation-copy.ts', text: 'Guaranteed life-changing wins.' });
if (process.env.MUTATE_EDITORIAL_MARKETS === '1') copies.push({ file: 'mutation-markets.ts', text: 'Live across 7 markets.' });

test('source copy avoids wealth promises and guaranteed outcomes', () => {
  const found = copies.filter(({ text }) => /life[\s-]changing|guaranteed/i.test(text)).map(({ file }) => file);
  assert.equal(found.join('\n'), '', 'forbidden copy in source files');
});

test('current source and code defaults never hard-code 7 markets', () => {
  const found = copies.filter(({ text }) => /\b7\s+markets\b/i.test(text)).map(({ file }) => file);
  assert.equal(found.join('\n'), '', 'markets must resolve from useStudioStats; admin database words stay untouched');
});
