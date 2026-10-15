import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const require = createRequire(import.meta.url), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const content = JSON.parse(readFileSync(new URL('../../../api/partnerDefault.json', import.meta.url), 'utf8'));
const { load } = createLoader({
  'lucide-react': pathToFileURL(require.resolve('lucide-react')).href,
  './liveCatalogue': data('export const lookupGame = () => null;'),
  '@/shared/content/SiteContentContext': data('export const useSection = (_key, fallback) => ({ ...fallback, title: "Edited partner headline" });'),
  '@/api/partnerDefault.json': data(`export default ${JSON.stringify(content)};`),
  '@/features/arena/topBar.css': data(''), './partner.css': data(''), './arenaPage.css': data(''),
});
const { PartnerPending } = await load('features/partner/PartnerPending.tsx');
const { PartnerDialog } = await load('features/partner/PartnerDialog.tsx');

test('a cold or failed lazy import immediately retains readable edited copy, the emblem and a named closable dialog', () => {
  for (const failed of [false, true]) {
    const markup = renderToStaticMarkup(React.createElement(PartnerDialog, { onClose() {}, returnFocusRef: { current: null }, events: [], isConnected: false },
      titleId => React.createElement(PartnerPending, { titleId, failed })));
    assert.match(markup, /role="dialog" aria-modal="true" aria-labelledby="([^"]+)"/);
    const id = markup.match(/aria-labelledby="([^"]+)"/)[1];
    assert.ok(markup.includes(`<h1 id="${id}"`));
    assert.match(markup, /Edited partner headline/);
    assert.match(markup, /<svg[^>]*class="partner__emblem"/);
    assert.match(markup, />Close<svg/);
    assert.match(markup, /aria-label="Mute ambient sound"/);
    assert.doesNotMatch(markup, /<canvas|opacity:0|inert=""/);
    assert.ok(markup.includes(failed ? 'could not be loaded' : 'Loading partner details'));
  }
});

test('App provides the immediate dialog on both loading and import errors, beneath the same scroll lock', () => {
  const app = readFileSync(new URL('../../../app/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /<ErrorBoundary fallback=\{<PartnerPending[^>]*failed/);
  assert.match(app, /<Suspense fallback=\{<PartnerPending/);
  assert.match(app, /<PartnerDialog onClose=\{closeClientArea\}/);
  assert.match(app, /<PartnerArea titleId=\{titleId\}/);
  assert.match(app, /returnFocusRef=\{clientOpenerRef\}/);
});
