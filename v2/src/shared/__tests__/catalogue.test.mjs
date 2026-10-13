// Run with npm run test:unit. Transpile and import the shipped TS/TSX sources.
// MUTATE_CATALOGUE_COUNT=1 restores a hard-coded 34 in current-count copy (red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const json = (path) => JSON.parse(source(path));
const moduleUrl = (src) => {
  const js = ts.transpileModule(src, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText.replace(/from ['"](react(?:\/jsx-runtime)?)['"]/g, (_match, name) =>
    `from '${pathToFileURL(require.resolve(name)).href}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
};
const rtpUrl = moduleUrl(source('../utils/gameRtp.ts'));
const { defaultRtp, catalogueMaxRtp } = await import(rtpUrl);
const rtpImports = (src) => src.replace("from '@/shared/utils/gameRtp'", `from '${rtpUrl}'`);
const { mapFeaturedRtp } = await import(moduleUrl(rtpImports(source('../../features/partner/featuredCatalogue.ts'))));
const { withGameCategory } = await import(moduleUrl(rtpImports(source('../../features/admin/gameEditorRtp.ts'))));
let countSource = source('../utils/catalogueText.ts');
if (process.env.MUTATE_CATALOGUE_COUNT === '1') {
  const target = '${counts.games}';
  assert.ok(countSource.includes(target), 'mutation target not found');
  countSource = countSource.replace(target, '34');
}
const countUrl = moduleUrl(countSource);
const { withCatalogueCounts } = await import(countUrl);
const catalogueSource = rtpImports(source('../../api/gameData.ts'))
  .replace("import { GameDataResponseSchema } from './schemas';", 'const GameDataResponseSchema = { parse: (value) => value };')
  .replace("import { fetchCatalogueFromDb } from './catalogueDb';", 'const fetchCatalogueFromDb = async () => null;');
const { GLADIATOR_SLOTS, METAWIN_ORIGINALS } = await import(moduleUrl(catalogueSource));
const curated = [...GLADIATOR_SLOTS, ...METAWIN_ORIGINALS];
const featured = (title, extra = {}) => ({ title, genre: 'Test mechanic', rtp: '99.5%', ...extra });
const counts = { games: 43, slots: 12, originals: 31 };

test('category defaults are 96.5 for slots and 97 for Originals', () => {
  assert.equal(defaultRtp('slot'), 96.5);
  assert.equal(defaultRtp('mini'), 97);
});

test('Max RTP is the highest RTP the catalogue shows, never a hand-typed figure', async () => {
  assert.equal(catalogueMaxRtp([{ rtp: 96.5 }, { rtp: 99.5 }, { rtp: 97 }]), 99.5);
  assert.equal(catalogueMaxRtp([{ rtp: undefined }, { rtp: Number.NaN }, { rtp: 96.4 }]), 96.4);
  assert.equal(catalogueMaxRtp([]), 97);
  assert.equal(catalogueMaxRtp(curated), 97);
  const src = rtpImports(source('../../api/siteContent.ts'))
    .replace("import { supabase } from '@/lib/supabase';", 'const supabase = {};')
    .replace(/import (\w+) from '\.\/(\w+Default\.json)';/g, (_match, name, file) =>
      `import ${name} from '${moduleUrl(`export default ${source(`../../api/${file}`)}`)}';`);
  const { SECTIONS } = await import(moduleUrl(src));
  const stats = SECTIONS.find((section) => section.key === 'stats');
  assert.equal(stats.fields.some((field) => field.key === 'rtp'), false);
  assert.equal('rtp' in stats.default, false);
});

test('every curated RTP and standalone featured JSON value uses its category default', () => {
  assert.ok(GLADIATOR_SLOTS.length > 0 && METAWIN_ORIGINALS.length > 0);
  for (const game of curated) {
    assert.equal(game.rtp, defaultRtp(game.category), game.title);
    assert.doesNotMatch(game.description, /99\.5%/);
  }
  const defaults = json('../../api/partnerDefault.json').catalogue;
  assert.deepEqual(mapFeaturedRtp(defaults, [], curated), defaults);
});

test('featured RTP uses the live value with a case-insensitive title match', () => {
  const input = Object.freeze([Object.freeze(featured('  TO THE TOP  '))]);
  const live = Object.freeze([{ title: 'To The Top', category: 'slot', rtp: 95.8 }]);
  assert.equal(mapFeaturedRtp(input, live, curated)[0].rtp, '95.8%');
  assert.equal(input[0].rtp, '99.5%');
});

test('a missing live RTP uses the live category, never an old featured or curated RTP', () => {
  assert.equal(mapFeaturedRtp([featured('New Original')], [
    { title: 'NEW ORIGINAL', category: 'mini' },
  ], [{ title: 'New Original', category: 'slot', rtp: 99 }])[0].rtp, '97%');
  assert.equal(mapFeaturedRtp([featured('To The Top')], [
    { title: 'To The Top', category: 'slot', rtp: null },
  ], curated)[0].rtp, '96.5%');
});

test('titles absent from the live catalogue use curated or explicit category defaults', () => {
  const entries = [featured('NAVIGATOR'), featured('To The Top'), featured('New Original', { category: 'mini' }), featured('Unknown slot')];
  assert.deepEqual(mapFeaturedRtp(entries, [], curated).map((g) => g.rtp), ['97%', '96.5%', '97%', '96.5%']);
});

test('featured formatting uses at most one decimal, omits .0, and preserves zero', () => {
  const games = [97, 96.5, 96.76, 0].map((rtp, i) => ({ title: `Game ${i}`, category: 'slot', rtp }));
  assert.deepEqual(mapFeaturedRtp(games.map((g) => featured(g.title)), games, []).map((g) => g.rtp), ['97%', '96.5%', '96.8%', '0%']);
});

test('Hero, About, Contact and Journey current-count text changes with the catalogue', () => {
  const templates = ['{{games}} titles', 'a battle-tested library of {{games}} titles', 'Integrate {{games}} titles via a single API', 'From founding to {{games}} live titles across 7 markets.'];
  for (const template of templates) {
    assert.match(withCatalogueCounts(template, counts), /43 (?:live )?titles/);
    assert.match(withCatalogueCounts(template, { ...counts, games: 44 }), /44 (?:live )?titles/);
  }
});

test('legacy editable copy resolves live total and category counts', () => {
  assert.equal(withCatalogueCounts('behind 34 live titles across 7 markets.', counts), 'behind 43 live titles across 7 markets.');
  assert.equal(withCatalogueCounts('all 8 Gladiator slots and 26 MetaWin Originals', counts), 'all 12 Gladiator slots and 31 MetaWin Originals');
  assert.equal(withCatalogueCounts('all {{slots}} Gladiator slots and {{originals}} MetaWin Originals', counts), 'all 12 Gladiator slots and 31 MetaWin Originals');
});

test('empty and single-title catalogues produce valid count text', () => {
  assert.equal(withCatalogueCounts('{{games}} titles', { games: 0, slots: 0, originals: 0 }), '0 titles');
  assert.equal(withCatalogueCounts('{{games}} live titles', { games: 1, slots: 0, originals: 1 }), '1 live title');
  assert.equal(withCatalogueCounts('{{slots}} Gladiator slots and {{originals}} MetaWin Originals', { games: 2, slots: 1, originals: 1 }), '1 Gladiator slot and 1 MetaWin Original');
});

test('new-game defaults follow category changes without mutating the draft', () => {
  const slot = Object.freeze({ id: 0, category: 'slot', rtp: defaultRtp('slot') });
  const original = withGameCategory(slot, 'mini', false);
  assert.equal(original.rtp, 97);
  assert.equal(withGameCategory(original, 'slot', false).rtp, 96.5);
  assert.equal(slot.rtp, 96.5);
});

test('operator-entered RTP, even a default or cleared value, survives a category change', () => {
  for (const rtp of [95.25, 96.5, 0, undefined]) {
    assert.equal(withGameCategory({ id: 0, category: 'slot', rtp }, 'mini', true).rtp, rtp);
    assert.equal(withGameCategory({ id: 1, category: 'slot', rtp }, 'mini', true).rtp, rtp);
  }
});

// Render the real provider and About component, stubbing visual primitives only.
// This proves legacy site_content metrics cannot override the catalogue count.
async function aboutRenderer(content = {}) {
  const sectionUrl = moduleUrl(`export function useSection(key, defaults) { return { ...defaults, ...(${JSON.stringify(content)})[key] }; }`);
  const statsUrl = moduleUrl(rtpImports(source('../content/StudioStats.tsx'))
    .replace("from './SiteContentContext'", `from '${sectionUrl}'`));
  const { CatalogueStatsProvider, useStudioStats, useCatalogueGames } = await import(statsUrl);
  const uiUrl = moduleUrl(`
    import { createElement } from 'react';
    export function Reveal({ children }) { return children; }
    export function CountUp({ to, suffix = '' }) { return createElement('span', null, to + suffix); }
    export function SectionHeading({ title, lede }) { return createElement('header', null, title, lede); }
    export function Button({ children }) { return createElement('button', null, children); }
    export function Divider() { return null; }
    export function SectionWrapper({ children }) { return createElement('section', null, children); }
  `);
  const aboutUrl = moduleUrl(source('../../features/about/AboutSection.tsx')
    .replace("from '@/shared/components/SectionWrapper'", `from '${uiUrl}'`)
    .replace("from '@/shared/ui'", `from '${uiUrl}'`)
    .replace("from '@/shared/content/SiteContentContext'", `from '${sectionUrl}'`)
    .replace("from '@/shared/content/StudioStats'", `from '${statsUrl}'`)
    .replace("from '@/shared/utils/catalogueText'", `from '${countUrl}'`)
    .replace("from '@/shared/utils/text'", `from '${moduleUrl(source('../utils/text.ts'))}'`)
    .replace("from '@/api/aboutDefault.json'", `from '${moduleUrl(`export default ${source('../../api/aboutDefault.json')}`)}'`));
  const { AboutSection } = await import(aboutUrl);
  return {
    render: (catalogue) => renderToStaticMarkup(React.createElement(CatalogueStatsProvider, { catalogue }, React.createElement(AboutSection))),
    stats: (catalogue) => {
      let result;
      function Probe() { result = { ...useStudioStats(), titles: useCatalogueGames().map((g) => g.title) }; return null; }
      renderToStaticMarkup(React.createElement(CatalogueStatsProvider, { catalogue }, React.createElement(Probe)));
      return result;
    },
  };
}

test('About Games metric and copy use published rows despite a stale content metric', async () => {
  const { render } = await aboutRenderer({ about: { metrics: [{ label: 'Games', value: 34 }] } });
  const html = render({ slotGames: Array.from({ length: 12 }, () => ({})), miniGames: Array.from({ length: 31 }, () => ({})) });
  assert.match(html.match(/library of \d+ titles/)?.[0], /library of 43 titles/);
  assert.match(html, /<span>43<\/span><span class="stat__label">Games/);
  assert.match(html, /all 12 Gladiator slots and 31 MetaWin Originals/);
  assert.doesNotMatch(html, /\b34\b|\{\{/);
});

test('shared stats default to 97% and use the curated roster while loading', async () => {
  const { stats } = await aboutRenderer();
  const result = stats({ slotGames: GLADIATOR_SLOTS, miniGames: METAWIN_ORIGINALS });
  assert.equal(result.games, curated.length);
  assert.equal(result.rtp, 97);
  assert.deepEqual(result.titles, curated.map((g) => g.title));
});

test('an authoritative empty catalogue stays empty and a stale content Max RTP is ignored', async () => {
  const { render, stats } = await aboutRenderer({ stats: { rtp: 98.4, games: 34 } });
  const empty = { slotGames: [], miniGames: [] };
  assert.equal(stats(empty).games, 0);
  assert.equal(stats(empty).rtp, 97);
  assert.match(render(empty).match(/library of \d+ titles/)?.[0], /library of 0 titles/);
  const live = { slotGames: [{ title: 'A', rtp: 94 }], miniGames: [{ title: 'B', rtp: 99.5 }] };
  assert.equal(stats(live).rtp, 99.5);
});

test('catalogue tabs omit loading counts and show the published category totals when ready', async () => {
  const uiUrl = moduleUrl(`
    import { createElement } from 'react';
    export function SectionWrapper({ children }) { return createElement('section', null, children); }
    export function SectionHeading() { return null; }
    export function GameCard() { return null; }
    export function FeaturedCard() { return null; }
  `);
  const soundUrl = moduleUrl('export const soundEngine = { click() {} };');
  const identityUrl = moduleUrl(source('../../features/starfield/gameIdentity.ts'));
  const focusUrl = moduleUrl(source('../../features/games/catalogueFocus.ts')
    .replace("from '@/features/starfield/gameIdentity'", `from '${identityUrl}'`));
  const showcaseUrl = moduleUrl(source('../../features/games/GameShowcase.tsx')
    .replace("from '@/shared/components/SectionWrapper'", `from '${uiUrl}'`)
    .replace("from '@/shared/ui'", `from '${uiUrl}'`)
    .replace("from './GameCard'", `from '${uiUrl}'`)
    .replace("from './catalogueFocus'", `from '${focusUrl}'`)
    .replace("from '@/shared/utils/soundEngine'", `from '${soundUrl}'`));
  const { GameShowcase } = await import(showcaseUrl);
  const render = (props) => renderToStaticMarkup(React.createElement(GameShowcase, props));
  const loading = render({ slotGames: [], miniGames: [], loading: true });
  assert.match(loading, />Slots<\/button>/);
  assert.match(loading, />Originals<\/button>/);
  assert.doesNotMatch(loading, /\(0\)|class="readout__value"/);
  const ready = render({ slotGames: GLADIATOR_SLOTS, miniGames: METAWIN_ORIGINALS, loading: false });
  assert.ok(ready.includes(`Slots (${GLADIATOR_SLOTS.length})`));
  assert.ok(ready.includes(`Originals (${METAWIN_ORIGINALS.length})`));
  assert.match(render({ slotGames: [], miniGames: [], loading: false }), /Slots \(0\)/);
});
