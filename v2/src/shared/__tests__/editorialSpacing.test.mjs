// M5 round 3 (browser measurement, 2026-10-15): body lines ran to 80–96 characters
// against the plan's ≤ 66, Team bio paragraphs and Contact's numbered rows touched,
// the enquiry chapter squeezed its numeral into its title, and every decorated button
// announced its arrow ("Sign in →").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cssRules, editorialCss, selectorList } from './editorialCssGuard.mjs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const pageCss = [editorialCss(), read('features/partner/partner.css'), read('features/team/teamDossier.css')].join('\n');
const rulesFor = selector => cssRules(pageCss).filter(({ selectors }) => selectorList(selectors).includes(selector));

test('page copy keeps a measure of about 66 characters', () => {
  const measure = pageCss.match(/--page-measure:\s*(\d+)ch/);
  assert.ok(measure, 'a shared --page-measure token sets the body measure');
  assert.ok(Number(measure[1]) <= 41, 'the longest body lines fit about 1.6 characters per ch, so ≤ 41ch keeps them ≤ 66 characters');
  for (const [, width] of pageCss.matchAll(/max-width:\s*(\d+)ch/g)) {
    assert.ok(Number(width) <= 50, `max-width ${width}ch lets body lines run past 66 characters`);
  }
  assert.ok(rulesFor('.partner__stage p').some(({ declarations }) => /max-width:\s*var\(--page-measure\)/.test(declarations)));
  assert.ok(rulesFor('.arena-page__dots li').some(({ declarations }) => /max-width:\s*var\(--page-measure\)/.test(declarations)));
  assert.ok(rulesFor('.partner__stage .arena-page__meta').some(({ declarations }) => /max-width:\s*none/.test(declarations)), 'short mono labels are not wrapped by the body measure');
});

test('decorative arrows stay out of accessible names', () => {
  const arrows = cssRules(pageCss).filter(({ declarations }) => /content:\s*'→'/.test(declarations));
  assert.ok(arrows.length >= 2, 'the page and portal buttons still draw an arrow');
  for (const { selectors, declarations } of arrows) {
    assert.match(declarations, /content:\s*'→'\s*\/\s*''/, `${selectors} must give its arrow an empty alternative text`);
  }
});

test('the enquiry chapter keeps the shared chapter grid and only its form is narrowed', () => {
  for (const { declarations } of rulesFor('.arena-page__contact-form')) {
    assert.doesNotMatch(declarations, /max-width/, 'narrowing the chapter squeezes its numeral into the title');
  }
  assert.ok(rulesFor('.arena-page__contact-form form').some(({ declarations }) => /max-width/.test(declarations)));
});

test('numbered contact rows put the number in its own column with room between rows', () => {
  const row = rulesFor('.arena-page__contact-partners > .arena-page__ledger-row').map(r => r.declarations).join(';');
  assert.match(row, /display:\s*grid/);
  assert.match(row, /grid-template-columns:/);
  assert.match(row, /padding-block:\s*\d+px/);
});

test('team bio paragraphs and the meta line above them do not touch', () => {
  const copy = rulesFor('.editorial-dossier__copy > p').map(r => r.declarations).join(';');
  assert.match(copy, /margin(?:-block)?:\s*0\s+0\s+[1-9]\d*px|margin-block:\s*0\s+[1-9]\d*px/);
  assert.ok(rulesFor('.editorial-dossier__copy > .arena-page__meta + p:not(.arena-page__meta)').length, 'the bio starts clear of the meta line');
});

test('the direct email fits a 320 px phone and can only break after the @', () => {
  const contact = read('features/contact/ContactSection.tsx');
  assert.match(contact, /@<wbr \/>/, 'a long address wraps as name@ / domain, never mid-word');
  const narrow = pageCss.match(/@media \(max-width: 380px\) \{[^}]*\.arena-page__direct-email \{[^}]*font-size:\s*clamp\(24px,\s*8vw,\s*32px\)/);
  assert.ok(narrow, '17 characters of Saira at 32 px overflow the 288 px column of a 320 px phone');
});
