import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { moduleUrl } from '../../../shared/__tests__/sourceModule.mjs';
import { createHarness, findAll, textOf, harnessHooksUrl } from '../../../shared/__tests__/hookHarness.mjs';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const resource = data => ({ data, loading: false, error: '', retry() {} });
const fixture = {
  docs: resource([{ id: 'doc', title: 'Integration', body: '<script>unsafe()</script>\n\nSecond paragraph' }]),
  credentials: resource([{ id: 'credential', label: 'Sandbox', sandbox_url: 'https://sandbox.example', username: 'partner-user', api_key: 'secret-key', notes: 'Test only' }]),
  games: resource([{ id: 1, slug: 'game-one', title: 'Published game', genre: 'Slots', rtp: '95.75', volatility: 'HIGH', release_date: '2026-10-15' }]),
  docFiles: resource([{ path: 'docs/integration.pdf', name: 'integration.pdf', size: 2048, mimeType: 'application/pdf' }]),
  assetFiles: resource([{ path: 'assets/game-one/logo.png', name: 'logo.png', size: 1024, mimeType: 'image/png' }, { path: 'assets/legacy-game/kit.zip', name: 'kit.zip', size: 4096, mimeType: 'application/zip' }]),
  certificateFiles: resource([{ path: 'certificates/game-one/certificate.pdf', name: 'certificate.pdf', size: 2048, mimeType: 'application/pdf' }]),
};
const dataUrl = moduleUrl('export const usePortalData = () => globalThis.__portalSectionsData;');
const storageUrl = moduleUrl('export const createPartnerDownload = file => globalThis.__portalDownload(file);');
const src = readFileSync(new URL('../PortalSections.tsx', import.meta.url), 'utf8');
const loader = createLoader({ './usePortalData': dataUrl, './portalStorage': storageUrl });
const { PortalSections } = await loader.load('features/partner/PortalSections.tsx');
const props = { partner: { id: 'partner', user_id: 'user', company: 'Example partner', active: true }, preview: false, userId: 'user' };
const render = patch => {
  globalThis.__portalSectionsData = fixture;
  return renderToStaticMarkup(React.createElement(PortalSections, { ...props, ...patch }));
};

test('all four sections use an accessible section nav, plain-text docs and stored game values', () => {
  const html = render();
  assert.match(html, /aria-label="Partner sections"/);
  assert.equal((html.match(/aria-current="true"/g) ?? []).length, 1);
  for (const title of ['Integration docs', 'Sandbox keys', 'Game assets', 'Games &amp; certificates']) assert.ok(html.includes(title), title);
  assert.match(html, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  for (const text of ['Second paragraph', '95.75', 'HIGH', '2026-10-15', 'Published game', 'legacy-game']) assert.ok(html.includes(text), text);
  for (const name of ['integration.pdf', 'logo.png', 'kit.zip', 'certificate.pdf']) assert.ok(html.includes(name), name);
});

test('keys start masked and preview never renders partner credentials', () => {
  const html = render();
  assert.doesNotMatch(html, /secret-key/);
  assert.match(html, /Reveal/);
  assert.match(html, /Copy username for Sandbox/);
  const preview = render({ partner: null, preview: true, userId: 'admin' });
  assert.match(preview, /each partner sees only its own credentials/i);
  assert.match(preview, /href="\/admin"/);
  assert.doesNotMatch(preview, /partner-user|secret-key|Reveal/);
});

test('each failed resource offers its own readable retry while other sections remain usable', () => {
  globalThis.__portalSectionsData = { ...fixture, docs: { ...resource([]), error: 'Could not load integration docs.', retry() {} } };
  const html = renderToStaticMarkup(React.createElement(PortalSections, props));
  assert.match(html, /role="alert"/);
  assert.match(html, /Could not load integration docs/);
  assert.match(html, /Retry/);
  assert.match(html, /Published game/);
  globalThis.__portalSectionsData = fixture;
});

test('reveal, username/key copy, polite feedback and on-demand downloads exercise real event handlers', async () => {
  const previous = { navigator: globalThis.navigator, document: globalThis.document, window: globalThis.window };
  const copied = [], downloaded = [], anchors = [];
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async value => { copied.push(value); } } }, configurable: true });
  globalThis.window = { location: { origin: 'https://studio.example' } };
  globalThis.document = { createElement: () => ({ click() { anchors.push(this.href); }, remove() {} }), body: { append() {} } };
  globalThis.__portalSectionsData = fixture;
  globalThis.__portalDownload = async file => { downloaded.push(file.path); return 'https://signed.example/download'; };
  const hooked = src.replace("from 'react'", `from '${harnessHooksUrl(moduleUrl)}'`)
    .replace("from './usePortalData'", `from '${dataUrl}'`)
    .replace("from './portalStorage'", `from '${storageUrl}'`)
    .replace("from './portalHelpers'", `from '${createLoader().urlOf('features/partner/portalHelpers.ts')}'`)
    .replace("from '@/features/arena-page/Editorial'", `from '${createLoader().urlOf('features/arena-page/Editorial.tsx')}'`)
    .replace("from '@/features/arena-page/DecodedKey'", `from '${createLoader().urlOf('features/arena-page/DecodedKey.tsx')}'`)
    .replace("from '@/shared/utils/text'", `from '${createLoader().urlOf('shared/utils/text.ts')}'`);
  const hookedModule = await import(moduleUrl(hooked));
  const harness = createHarness(hookedModule.PortalSections);
  try {
    harness.mount(props);
    const index = findAll(harness.output, node => node.type?.name === 'EditorialIndex')[0];
    assert.equal(index.props.chapters.map(chapter => chapter.id).join(','), 'partner-docs,partner-credentials,partner-assets,partner-games');
    const buttons = () => findAll(harness.output, node => node.type === 'button');
    harness.act(() => buttons().find(button => textOf(button) === 'Reveal').props.onClick());
    assert.equal(textOf(harness.output).includes('secret-key'), true);
    await buttons().find(button => button.props['aria-label'] === 'Copy username for Sandbox').props.onClick();
    harness.act(() => {});
    await buttons().find(button => button.props['aria-label'] === 'Copy API key for Sandbox').props.onClick();
    harness.act(() => {});
    assert.equal(copied.join(','), 'partner-user,secret-key');
    assert.equal(findAll(harness.output, node => node.props?.['aria-live'] === 'polite').some(node => textOf(node).includes('Copied')), true);
    assert.equal(downloaded.length, 0);
    const downloadButton = buttons().find(button => button.props['aria-label'] === 'Download integration.pdf');
    await downloadButton.props.onClick();
    harness.act(() => {});
    assert.equal(downloaded.join(','), 'docs/integration.pdf');
    assert.equal(anchors.join(','), 'https://signed.example/download');
    globalThis.__portalDownload = async () => { throw new Error('Network unavailable'); };
    await downloadButton.props.onClick();
    harness.act(() => {});
    assert.equal(findAll(harness.output, node => node.props?.role === 'alert').some(node => textOf(node).includes('Could not download integration.pdf')), true);
    assert.equal(buttons().find(button => button.props['aria-label'] === 'Download integration.pdf').props.disabled, false);
    globalThis.navigator.clipboard.writeText = async () => { throw new Error('Clipboard denied'); };
    await buttons().find(button => button.props['aria-label'] === 'Copy username for Sandbox').props.onClick();
    harness.act(() => {});
    assert.equal(findAll(harness.output, node => node.props?.role === 'alert').some(node => textOf(node).includes('Select and copy')), true);
  } finally {
    harness.unmount();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else Object.defineProperty(globalThis, key, { value, configurable: true });
    }
  }
});
