import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createLoader } from './loadTs.mjs';
import { createHarness, findAll, harnessHooksUrl, textOf } from './hookHarness.mjs';
import { cssRules, selectorList } from './editorialCssGuard.mjs';

const require = createRequire(import.meta.url), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const src = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const defaults = Object.fromEntries(['about', 'team', 'journey', 'careers', 'partner'].map(name => [name, JSON.parse(src(`api/${name}Default.json`))]));
const origin = 'https://studio.example';
const stats = { games: 43, slots: 12, originals: 31, rtp: 97.4, markets: 7, years: 10 };
const games = [{ id: 1, title: 'Test game', category: 'slot', timeline: '2026-10-20', link: 'https://demo.example/game', description: '' }];
const feed = { events: [], isConnected: false, eventsPerSecond: 0, totalAmount: 0, gladiatorCount: 0, originalCount: 0, gladiatorTotal: 0, originalTotal: 0 };
const portal = {
  docs: [], credentials: [{ id: 'sandbox', label: 'Test sandbox', username: 'test-user', api_key: 'test-key', sandbox_url: 'https://sandbox.example' }],
  games: [{ id: 1, slug: 'test-game', title: 'Test game' }],
  docFiles: [{ path: 'docs/integration.pdf', name: 'integration.pdf' }],
  assetFiles: [{ path: 'assets/test-game/logo.png', name: 'logo.png' }],
  certificateFiles: [{ path: 'certificates/test-game/certificate.pdf', name: 'certificate.pdf' }],
};
const infra = {
  'lucide-react': pathToFileURL(require.resolve('lucide-react')).href,
  'framer-motion': pathToFileURL(require.resolve('framer-motion')).href,
  '@/shared/content/StudioStats': data(`export const useStudioStats = () => (${JSON.stringify(stats)}); export const useCatalogueGames = () => ${JSON.stringify(games)};`),
  '@/shared/utils/soundEngine': data('export const soundEngine = { subscribeMute: () => () => {}, isMuted: () => false, click() {}, hover() {}, transmission() {}, alert() {} };'),
  '@/shared/constants/urls': data('export const CONTACT = { email: "studio@example.com", phone: "+44 20 0000 0000", location: "London" };'),
  '@/lib/supabase': data('export const supabase = { functions: { invoke: (...args) => globalThis.__actionArrowEnquiry(...args) } };'),
  './portalStorage': data('export const createPartnerDownload = () => { throw Error("No downloads during rendering"); };'),
  './liveCatalogue': data('export const lookupGame = () => undefined;'),
};
const pages = {
  about: ['about/AboutSection.tsx', 'AboutSection'], team: ['team/TeamSection.tsx', 'TeamSection'],
  journey: ['journey/JourneySection.tsx', 'JourneySection'], careers: ['careers/CareersSection.tsx', 'CareersSection'],
  contact: ['contact/ContactSection.tsx', 'ContactSection'], games: ['games/GamesPage.tsx', 'GamesPage'],
  live: ['live-feed/LiveActivityFeed.tsx', 'LiveActivityFeed'], partner: ['partner/PartnerPage.tsx', 'PartnerPage'],
};
const dossierHref = 'mailto:cwang@metawin.inc?subject=Speculative%20Application%20%E2%80%94%20Gladiator%20Studio';
const socialInventory = [
  ['LinkedIn profile', 'https://www.linkedin.com/in/chaow/'],
  ['Send email', 'mailto:cwang@metawin.inc'],
  ['GitHub organisation', 'https://github.com/gladiator-studio'],
];
const inventory = {
  about: [
    ['Visit MetaWin', 'https://metawin.com'],
    ['Request a demo', 'mailto:cwang@metawin.inc?subject=Demo Request — Gladiator Studio'],
    ['Partner with us', ''],
  ],
  team: [...socialInventory, ['See open roles', '']],
  journey: [],
  careers: [...defaults.careers.positions.map(job => ['Apply', job.applyUrl]), ['Get in Touch', dossierHref]],
  contact: [['Send Enquiry', '']],
  games: ['All', 'Slots', 'Originals', 'Hot', 'Play demo: Test game'].map(label => [label, '']),
  live: [],
  partner: [['Sign in', '']],
};

function loader(sections = {}, errors = false, extra = {}) {
  return createLoader({ ...infra,
    '@/shared/content/SiteContentContext': data(`const sections = ${JSON.stringify({ ...defaults, ...sections })}; export const useSection = (key, fallback) => sections[key] ?? fallback;`),
    './usePortalData': data(`const fixture = ${JSON.stringify(portal)}; export const usePortalData = () => Object.fromEntries(Object.entries(fixture).map(([key, data]) => [key, { data, loading: false, error: ${errors ? '"Unavailable"' : '""'}, retry() {} }]));`),
    ...extra,
  });
}

function withOrigin(render) {
  const previous = globalThis.window;
  globalThis.window = { location: { origin } };
  try { return render(); }
  finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
}

async function render(page, props = {}, sections = {}, errors = false) {
  const [file, name] = pages[page], Component = (await loader(sections, errors).load(`features/${file}`))[name];
  return withOrigin(() => renderToStaticMarkup(React.createElement(Component, { titleId: `${page}-title`, games, loading: false, onPlayGame() {}, content: defaults.partner, ...feed, ...props })));
}

function actions(html, buttonDestinations) {
  return [...html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g)].flatMap(([, tag, attributes, body]) => {
    const attr = name => attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] ?? '';
    const classes = attr('class').split(/\s+/);
    const label = attr('aria-label') || body.replace(/<[^>]*>|[↗→]/g, '').trim();
    const href = attr('href'), destination = tag === 'button' ? buttonDestinations[label] ?? '' : href;
    return classes.some(name => ['arena-page__action', 'partner__button'].includes(name))
      ? [{ tag, body, href, destination, target: attr('target'), label }] : [];
  });
}

function assertArrows(html, buttonDestinations = {}) {
  const found = actions(html, buttonDestinations);
  for (const action of found) {
    const external = action.target === '_blank' || /^(?:mailto:|tel:)/i.test(action.destination)
      || /^https?:\/\//i.test(action.destination) && new URL(action.destination).origin !== origin;
    const markers = [...action.body.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/g)]
      .filter(([, attributes]) => /class="(?:arena-page__action-arrow|partner__button-arrow)"/.test(attributes));
    assert.deepEqual(action.body.match(/[↗→]/g) ?? [], external ? ['↗'] : [], `${action.label}: ${action.destination || action.tag}`);
    assert.equal(markers.length, external ? 1 : 0, `${action.label}: external arrows must suppress the CSS arrow`);
    for (const [, attributes, body] of markers) {
      assert.match(attributes, /aria-hidden="true"/);
      assert.equal(body, '↗');
    }
    assert.doesNotMatch(action.body, /<svg\b/, `${action.label}: an icon must not suppress the only CSS arrow`);
  }
  return found;
}

function assertInventory(found, expected) {
  assert.deepEqual(found.map(({ label, destination }) => [label, destination]), expected);
}

for (const page of Object.keys(pages)) {
  test(`${page}: every rendered public action has exactly one arrow with the required direction`, async () => {
    assertInventory(assertArrows(await render(page)), inventory[page]);
  });
}

test('empty Careers and Team retain the external dossier action and internal careers navigation', async () => {
  const sections = { careers: { ...defaults.careers, positions: [] } };
  const dossier = assertArrows(await render('careers', {}, sections));
  assertInventory(dossier, [['Send your dossier', dossierHref]]);
  assertInventory(assertArrows(await render('team', {}, sections)), [...socialInventory, ['Work with us', '']]);
});

test('target blank remains external for same-origin and relative application destinations', async () => {
  for (const applyUrl of [`${origin}/apply`, '/apply', '#apply']) {
    const sections = { careers: { ...defaults.careers, positions: [{ ...defaults.careers.positions[0], applyUrl }] } };
    const [apply] = assertArrows(await render('careers', {}, sections));
    assert.equal(apply.target, '_blank');
    assert.equal(apply.href, applyUrl);
  }
});

for (const status of ['partner', 'preview', 'error', 'noaccess']) {
  test(`partner ${status}: authentication, download, copy, reveal and retry actions stay internal`, async () => {
    const auth = { status, session: { user: { id: 'test-user', email: 'partner@example.com' } }, partner: { id: 'test-partner', company: 'Test partner' } };
    const found = assertArrows(await render('partner', { auth }));
    const labels = ['Sign out'];
    if (status === 'partner' || status === 'preview') labels.push('Download integration.pdf');
    if (status === 'partner') labels.push('Copy username for Test sandbox', 'Reveal API key for Test sandbox', 'Copy API key for Test sandbox');
    if (status === 'partner' || status === 'preview') labels.push('Download logo.png', 'Download certificate.pdf');
    if (status === 'error') labels.push('Retry');
    assertInventory(found, labels.map(label => [label, '']));
  });
}

test('all portal resource errors retain their internal retry arrows', async () => {
  const auth = { status: 'partner', session: { user: { id: 'test-user' } }, partner: { id: 'test-partner' } };
  assert.equal(assertArrows(await render('partner', { auth }, {}, true)).filter(action => action.label === 'Retry').length, Object.keys(portal).length);
});

test('contact mail-app buttons use external arrows while submit, busy, copy and success stay internal', async () => {
  const names = ['useState', 'useRef', 'useMemo', 'useCallback', 'useId', 'useSyncExternalStore', 'useEffect', 'useLayoutEffect'];
  const reactUrl = pathToFileURL(require.resolve('react')).href;
  const hooks = data(`import * as React from '${reactUrl}'; import * as hooks from '${harnessHooksUrl(data)}'; export * from '${reactUrl}'; ${names.map(name => `export const ${name} = (...args) => (globalThis.__hookHarness ? hooks : React).${name}(...args);`).join(' ')}`);
  const { ContactSection } = await loader({}, false, { react: hooks }).load('features/contact/ContactSection.tsx');
  const h = createHarness(ContactSection), previous = globalThis.__actionArrowEnquiry;
  let finish;
  globalThis.__actionArrowEnquiry = () => new Promise(resolve => { finish = resolve; });
  const emailApp = 'mailto:studio@example.com';
  const check = expected => assertInventory(assertArrows(withOrigin(() => renderToStaticMarkup(h.output)), {
    'Use email app': emailApp, 'Open email app again': emailApp,
  }), expected);
  try {
    h.mount({ titleId: 'contact-title' });
    for (const [name, value] of Object.entries({ name: 'Test user', email: 'visitor@example.com', enquiryType: 'Game Integration', message: 'Please send details.' })) {
      h.act(() => findAll(h.output, node => node.props?.name === name)[0].props.onChange({ target: { value } }));
    }
    check([['Send Enquiry', '']]);
    const submit = () => findAll(h.output, node => typeof node.props?.onSubmit === 'function')[0].props.onSubmit({ preventDefault() {} });
    const pending = submit(); h.act(() => {});
    check([['Sending…', '']]);
    assert.equal(findAll(h.output, node => node.type === 'button' && textOf(node).includes('Sending'))[0].props.disabled, true);
    finish({ error: {}, response: { status: 500, json: async () => ({ error: 'Try again' }) } });
    await pending; h.act(() => {});
    check([['Use email app', emailApp], ['Copy message', ''], ['Send Enquiry', '']]);
    for (const label of ['Use email app', 'Open email app again']) {
      const destination = withOrigin(() => {
        const button = findAll(h.output, node => node.type === 'button' && textOf(node).replace(/[↗→]/g, '').trim() === label)[0];
        assert.ok(button, label);
        h.act(() => button.props.onClick());
        return new URL(window.location.href);
      });
      assert.equal(`${destination.protocol}${destination.pathname}`, emailApp);
      assert.equal(destination.searchParams.get('subject'), 'Enquiry — Game Integration — Test user');
      check([['Open email app again', emailApp], ['Copy message', ''], ['Send Enquiry', '']]);
    }
    globalThis.__actionArrowEnquiry = async () => ({ data: { ok: true, stored: true } });
    await submit(); h.act(() => {});
    check([['Send another', '']]);
  } finally {
    h.unmount();
    if (previous === undefined) delete globalThis.__actionArrowEnquiry; else globalThis.__actionArrowEnquiry = previous;
  }
});

test('CSS supplies one silent internal arrow, excludes the explicit external arrow and preserves action states', () => {
  const css = src('features/arena-page/editorialBody.css');
  const rules = cssRules(css);
  const arrows = rules.filter(({ declarations }) => /content:\s*'→'/.test(declarations));
  assert.ok(arrows.length > 0);
  for (const { selectors, declarations } of arrows) {
    for (const selector of selectorList(selectors)) assert.match(selector, /\.arena-page__action:not\(:has\([^)]*\.arena-page__action-arrow\)\)::after/);
    assert.match(declarations, /content:\s*'→'\s*\/\s*''/);
  }
  assert.ok(rules.some(({ selectors, declarations }) => selectors.includes('.arena-page__action-arrow') && /transition:\s*transform/.test(declarations)));
  assert.ok(rules.some(({ selectors, declarations }) => selectors.includes('.arena-page__action:not(:has(svg, .arena-page__action-arrow)):is(:hover,:focus-visible)::after') && /translateX\(4px\)/.test(declarations)));
  assert.ok(rules.some(({ selectors }) => selectorList(selectors).includes('.arena-page__action:disabled')));
  assert.ok(cssRules(src('features/partner/partner.css')).some(({ selectors, declarations }) => selectorList(selectors).includes('.partner__button::after') && /content:\s*'→'\s*\/\s*''/.test(declarations)));
});
