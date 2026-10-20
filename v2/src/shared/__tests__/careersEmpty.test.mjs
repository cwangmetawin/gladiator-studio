import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createLoader } from './loadTs.mjs';

const require = createRequire(import.meta.url), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const careersDefault = JSON.parse(readFileSync(new URL('../../api/careersDefault.json', import.meta.url), 'utf8'));
const emptyCareers = { positions: [], apply_email: 'cwang@metawin.inc' };
const deck = 'We are not advertising a role at the moment. We still want to hear from senior engineers, designers and game mathematicians: send your dossier and we will keep it on file for the next opening.';
const infra = {
  '@/shared/content/StudioStats': data('export const useStudioStats = () => ({ games: 43, slots: 12, originals: 31, rtp: 97.4, markets: 7, years: 10 });'),
};
const pages = { careers: ['careers/CareersSection.tsx', 'CareersSection'], team: ['team/TeamSection.tsx', 'TeamSection'] };

async function renderSection(page, careers) {
  const { load } = createLoader({ ...infra,
    '@/shared/content/SiteContentContext': data(`export const useSection = (key, fallback) => key === 'careers' ? ${JSON.stringify(careers)} : fallback;`),
  });
  const [file, name] = pages[page], Component = (await load(`features/${file}`))[name];
  const previousWindow = globalThis.window;
  try {
    // Link validation needs a browser origin; leaving document absent keeps editorial markup static.
    globalThis.window = { location: { origin: 'http://localhost' } };
    return renderToStaticMarkup(React.createElement(Component, { titleId: `${page}-title` }));
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
}

function assertEmptyCareers(html) {
  assert.deepEqual([...html.matchAll(/<section id="(careers-[^"]+)"/g)].map(([, id]) => id), ['careers-open-application']);
  assert.match(html, /aria-label="No open roles right now"/);
  assert.match(html, /aria-label="01 · Careers"/);
  assert.ok(html.includes(`<p class="editorial-deck">${deck}</p>`));
  assert.equal(html.match(/class="arena-page__actions"/g)?.length, 1);
  assert.equal(html.match(/class="arena-page__action"/g)?.length, 1);
  assert.match(html, /<a class="arena-page__action" href="mailto:cwang@metawin\.inc\?subject=Speculative%20Application%20%E2%80%94%20Gladiator%20Studio">Send your dossier <span class="arena-page__action-arrow" aria-hidden="true">↗<\/span><\/a>/);
  assert.doesNotMatch(html, /open roles ·|Role Not Listed\?|<ol\b|class="editorial-index\b|aria-label="Page chapters"/);
}

test('careers without positions renders one open-application chapter and dossier link', async () => {
  assertEmptyCareers(await renderSection('careers', emptyCareers));
});

test('careers preserves default roles, both chapters and the index, then shows the empty state when cleared', async () => {
  const html = await renderSection('careers', careersDefault);
  assert.deepEqual([...html.matchAll(/<section id="(careers-[^"]+)"/g)].map(([, id]) => id), ['careers-roles', 'careers-contact']);
  assert.match(html, /aria-label="Open roles"/);
  assert.match(html, /aria-label="Role Not Listed\?"/);
  assert.match(html, /<nav class="editorial-index" aria-label="Page chapters">/);
  assert.match(html, /href="#careers-roles"/);
  assert.match(html, /href="#careers-contact"/);
  assert.match(html, /<ol class="arena-page__rows arena-page__positions">/);
  assert.ok(html.includes(`${careersDefault.positions.length} open roles · hiring on a rolling basis`));
  assert.equal(html.match(/<details class="arena-page__details arena-page__position"/g)?.length, careersDefault.positions.length);
  for (const job of careersDefault.positions) assert.ok(html.includes(job.title), job.title);
  assert.doesNotMatch(html, /careers-open-application|No open roles right now|Send your dossier/);
  assertEmptyCareers(await renderSection('careers', { ...careersDefault, positions: [] }));
});

test('rows without a title count as no positions on Careers and Team', async () => {
  const careers = { ...emptyCareers, positions: [null, {}, { title: '' }, { title: null }] };
  assertEmptyCareers(await renderSection('careers', careers));
  const html = await renderSection('team', careers);
  assert.match(html, /<button class="arena-page__action" type="button">Work with us<\/button>/);
  assert.doesNotMatch(html, /See open roles/);
});

test('Team uses See open roles with positions and Work with us without positions', async () => {
  const html = await renderSection('team', careersDefault);
  assert.match(html, /<button class="arena-page__action" type="button">See open roles<\/button>/);
  assert.doesNotMatch(html, /Work with us/);
  const emptyHtml = await renderSection('team', emptyCareers);
  assert.match(emptyHtml, /<button class="arena-page__action" type="button">Work with us<\/button>/);
  assert.doesNotMatch(emptyHtml, /See open roles/);
});
