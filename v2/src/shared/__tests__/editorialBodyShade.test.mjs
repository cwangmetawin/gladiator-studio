import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bodyBleedShadeSelectors, cssRules, editorialCss, sourceStyleSheets } from './editorialCssGuard.mjs';

const css = editorialCss();
const styles = sourceStyleSheets();
const allSourceCss = styles.map(style => style.css).join('\n');

test('chapter, ledger, counter, form and portal body copy never receives per-element bleed shades', () => {
  assert.deepEqual(bodyBleedShadeSelectors(allSourceCss), []);
});

test('the shade guard includes partner and team CSS and rejects a cross-file reintroduction', () => {
  for (const file of ['features/partner/partner.css', 'features/team/teamDossier.css']) {
    assert.ok(styles.some(style => style.file === file), `${file} is part of the source scan`);
    const selector = file.includes('partner') ? '.partner__document p::after' : '.editorial-dossier__copy p::after';
    const mutation = styles.map(style => style.file === file
      ? `${style.css}\n${selector} { inset: calc(-1 * var(--page-copy-bleed)); }` : style.css).join('\n');
    assert.deepEqual(bodyBleedShadeSelectors(mutation), [selector], `${file} cannot hide a body shade outside the editorial stylesheet`);
  }
});

test('the body shade guard rejects reintroduced broad and nested copy shades in memory', () => {
  for (const selector of [
    '.partner__stage :is(p, h2, h3)::after',
    '.partner__body p::after',
    '.editorial-chapter__body .editorial-ledger__row::after',
    '.editorial-counter__label::after',
    '.arena-page__contact-form .field-label::after',
    '.partner__document p::after',
    '.partner__hero .partner__lede::after',
    '.partner__hero p::after, .partner__body p::after',
  ]) {
    const mutation = `${css}\n${selector} { inset: calc(-1 * var(--page-copy-bleed)); }`;
    assert.ok(bodyBleedShadeSelectors(mutation).length > 0, `${selector} must fail the guard`);
  }
});

test('the in-memory mutation fixture fails when the body shade guard is removed', async () => {
  const source = readFileSync(new URL('./editorialCssGuard.mjs', import.meta.url), 'utf8');
  const removed = source.replace('return cssRules(css).flatMap(', 'return [].flatMap(');
  assert.notEqual(removed, source, 'the mutation disables the real guard traversal');
  const mutant = await import(`data:text/javascript;base64,${Buffer.from(removed).toString('base64')}`);
  const fixture = '.partner__body p::after { inset: calc(-1 * var(--page-copy-bleed)); }';
  const expectDetection = guard => assert.ok(guard(fixture).length > 0, 'body shade mutation must be detected');
  expectDetection(bodyBleedShadeSelectors);
  assert.throws(() => expectDetection(mutant.bodyBleedShadeSelectors), /body shade mutation must be detected/);
});

test('the whole page body owns one backdrop and chapters do not add rectangular backing', () => {
  const backdrop = cssRules(css).filter(({ selectors, declarations }) =>
    /\.partner__body::before\b/.test(selectors) && /\bbackground\s*:/.test(declarations));
  assert.equal(backdrop.length, 1, 'one continuous body backdrop, including across lazy CSS');
  assert.equal(cssRules(css).some(({ selectors, declarations }) =>
    /\.(?:editorial-chapter|partner__hero)::before\b/.test(selectors) && /\bbackground\s*:/.test(declarations)), false);
});
