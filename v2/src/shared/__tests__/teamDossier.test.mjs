import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createLoader } from './loadTs.mjs';
import { moduleUrl } from './sourceModule.mjs';
import { createHarness, harnessHooksUrl, findAll, textOf } from './hookHarness.mjs';

const require = createRequire(import.meta.url), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const person = JSON.parse(readFileSync(new URL('../../api/teamDefault.json', import.meta.url), 'utf8')).people[0];
const infra = {
  './teamDossier.css': data(''), './editorialBody.css': data(''),
  '@/shared/content/SiteContentContext': data('export const useSection = (_key, fallback) => fallback;'),
  '@/shared/content/StudioStats': data('export const useStudioStats = () => ({ games: 38, slots: 11, originals: 27, rtp: 99.5, markets: 7, years: 10 });'),
};

test('a missing team photo is a compact title companion, preserving the name, role and every bio paragraph', async () => {
  const { TeamSection } = await createLoader(infra).load('features/team/TeamSection.tsx');
  const html = renderToStaticMarkup(React.createElement(TeamSection, { titleId: 'team-title', bodyOnly: true }));
  assert.match(html, /editorial-dossier--monogram/);
  assert.match(html, /class="editorial-chapter__heading"[^]*?class="editorial-dossier__image editorial-dossier__image--monogram"[^]*?class="editorial-chapter__identity"/);
  assert.match(html, /<h2[^>]*aria-label="CHAO WANG"/);
  assert.match(html, /CTO &amp; Head of Game Development/);
  assert.equal(html.match(/editorial-dossier__initials/g)?.length, 1);
  for (const paragraph of person.bio.split(/\n\s*\n/)) {
    assert.ok(html.includes(renderToStaticMarkup(React.createElement('p', null, paragraph))), 'admin bio paragraph remains intact');
  }
});

test('a broken team portrait switches to the compact monogram and a later image can load', async () => {
  const hooks = data(`export * from '${pathToFileURL(require.resolve('react')).href}'; export { useState } from '${harnessHooksUrl(moduleUrl)}';`);
  const { TeamSection } = await createLoader({ ...infra, react: hooks }).load('features/team/TeamSection.tsx');
  const node = findAll(TeamSection({ titleId: 'team-title' }), element => typeof element.type === 'function' && element.type.name === 'Profile')[0];
  const h = createHarness(node.type);
  const props = { ...node.props, person: { ...person, image: 'https://cdn.example/portrait.webp' } };
  const previousWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://gladiator.test' } };
  h.mount(props);
  try {
    const image = findAll(h.output, element => element.type === 'img')[0];
    assert.ok(image, 'a valid photo renders as an image');
    assert.match(h.output.props.className, /editorial-dossier--photo/);
    h.act(() => image.props.onError({ currentTarget: { hidden: false } }));
    assert.equal(findAll(h.output, element => element.type === 'img').length, 0);
    assert.match(h.output.props.className, /editorial-dossier--monogram/);
    assert.equal(textOf(h.output.props.titleCompanion), person.initials);
    h.update({ ...props, person: { ...person, image: 'https://cdn.example/replacement.webp' } });
    assert.equal(findAll(h.output, element => element.type === 'img')[0]?.props.src, 'https://cdn.example/replacement.webp');
  } finally {
    h.unmount();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('the dossier stylesheet bounds photos and uses a transparent square outline monogram without stretch', () => {
  const url = new URL('../../features/team/teamDossier.css', import.meta.url);
  const css = existsSync(url) ? readFileSync(url, 'utf8') : '';
  assert.match(css, /\.editorial-dossier__portrait\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*5[^}]*max-height:\s*520px/);
  assert.match(css, /\.editorial-dossier__portrait\s*\{[^}]*filter:\s*grayscale\(1\)/);
  assert.match(css, /\.editorial-dossier__image--monogram\s*\{[^}]*width:\s*220px[^}]*aspect-ratio:\s*1[^}]*background:\s*transparent/);
  assert.match(css, /\.editorial-dossier__initials\s*\{[^}]*'Saira Title'[^}]*-webkit-text-fill-color:\s*transparent[^}]*-webkit-text-stroke:\s*1px/);
  assert.match(css, /@media\s*\(max-width:\s*767px\)[^]*?\.editorial-dossier__image--monogram\s*\{[^}]*width:\s*160px/);
  assert.doesNotMatch(css, /min-height:\s*(?:320|440)px/);
});
