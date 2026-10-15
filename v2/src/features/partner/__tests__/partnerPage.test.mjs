import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';
import { findAll } from '../../../shared/__tests__/hookHarness.mjs';

const require = createRequire(import.meta.url), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { load } = createLoader({ 'lucide-react': pathToFileURL(require.resolve('lucide-react')).href });
const { PartnerPage } = await load('features/partner/PartnerPage.tsx');
const content = JSON.parse(readFileSync(new URL('../../../api/partnerDefault.json', import.meta.url), 'utf8'));
const stats = { games: 41, slots: 12, originals: 29, rtp: 94.2, markets: 9, years: 10 };
const props = patch => ({ content, stats, catalogue: [{ title: 'A live title', genre: 'Edited genre', rtp: '94.2%',
  cover: { url: '/arena/games/example-320.webp', fallbackUrl: '/source.webp', width: 320, height: 480 } }], coversReady: true, titleId: 'partner-title', ...patch });
const render = patch => renderToStaticMarkup(React.createElement(PartnerPage, props(patch)));

test('one readable Saira headline, a steel emblem, all admin fields and live catalogue counts survive the redesign', () => {
  const markup = render();
  for (const field of ['eyebrow', 'title', 'lede', 'ctaLabel', 'contactEmail', 'complianceTitle', 'complianceBody', 'closingTitle', 'closingBody']) {
    const encoded = renderToStaticMarkup(React.createElement('span', null, content[field])).slice(6, -7);
    assert.ok(markup.includes(encoded), field);
  }
  for (const row of content.valueProps) { assert.ok(markup.includes(row.tag)); assert.ok(markup.includes(row.title)); }
  for (const row of content.steps) assert.ok(markup.includes(row.step.replaceAll('&', '&amp;')));
  for (const text of [...content.specs, ...content.compliancePoints, ...content.faqs.flatMap(f => [f.q, f.a])]) {
    assert.ok(markup.includes(renderToStaticMarkup(React.createElement('span', null, text)).slice(6, -7)), text);
  }
  assert.equal(markup.match(/<h1\b/g)?.length, 1);
  assert.match(markup, /<h1 id="partner-title"/);
  assert.match(markup, /<svg[^>]*class="partner__emblem"/);
  assert.match(markup, /id="partner-title-steel"/);
  assert.doesNotMatch(markup, /id="flat-emblem-fill"/);
  assert.match(markup, /all 12 Gladiator slots and 29 MetaWin Originals/);
  for (const text of ['41', '94.2%', '9', 'A live title', 'Edited genre']) assert.ok(markup.includes(text));
  assert.doesNotMatch(markup, /99\.5%|\{\{|<canvas|STEP_|transmit|protocol|uplink|disengage/i);
});

test('the ordered steps and dot lists have valid direct list children; empty, legacy and body-only fields still render', () => {
  const markup = render({ content: { ...content, valueProps: [], steps: [], catalogue: [], specs: 'First\nSecond',
    complianceTitle: '', complianceBody: 'Body-only compliance', compliancePoints: [], faqs: [] }, catalogue: [] });
  assert.match(markup, /Body-only compliance/);
  assert.match(markup, /<li>First<\/li><li>Second<\/li>/);
  assert.doesNotMatch(markup, /Featured titles|Partner FAQ|Integration steps/);
  const tree = PartnerPage(props());
  for (const list of findAll(tree, node => node.type === 'ol' || node.type === 'ul')) {
    const children = [list.props.children].flat(Infinity).filter(Boolean);
    assert.ok(children.every(child => child.type === 'li'), 'semantic lists cannot wrap li in reveal divs');
  }
});

test('the catalogue strip has baked images, dimensions and text immediately; a failed image falls back only once', () => {
  const markup = render();
  assert.match(markup, /src="\/arena\/games\/example-320.webp"/);
  assert.match(markup, /width="320" height="480"/);
  const image = findAll(PartnerPage(props()), node => node.type === 'img')[0];
  const node = { src: '/arena/games/example-320.webp', dataset: {}, hidden: false };
  image.props.onError({ currentTarget: node });
  assert.equal(node.src, '/source.webp');
  image.props.onError({ currentTarget: node });
  assert.equal(node.hidden, true, 'a broken original cannot loop requests');
  const pending = render({ coversReady: false });
  assert.doesNotMatch(pending, /<img/);
  assert.match(pending, /A live title/);
});

test('request access keeps the edited destination and contact email is ordinary selectable linked text', () => {
  const previous = globalThis.window;
  globalThis.window = { location: { origin: 'https://studio.example' } };
  try {
    const markup = render({ content: { ...content, ctaUrl: 'javascript:alert(1)' } });
    assert.doesNotMatch(markup, /href="javascript:/);
    assert.match(render(), /href="mailto:cwang@metawin\.inc\?subject=/);
    assert.match(markup, /class="partner__contact"[^>]*>[\s\S]*>cwang@metawin\.inc<\/a>/);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});
