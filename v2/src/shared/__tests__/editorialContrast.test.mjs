import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { colourChannels as rgb, contrastRatio as ratio, compositeShade, cssRules, editorialCss, selectorList, shadeAlpha } from './editorialCssGuard.mjs';

const source = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const theme = source('shared/design/theme.css');
let partnerCss = source('features/partner/partner.css');
let css = editorialCss();
if (process.env.MUTATE_EDITORIAL_TOKEN === '1') css = css.replace(/(--page-meta-colour\s*:)\s*var\(--color-ice-200\)/, '$1 var(--color-ice-400)');
if (process.env.MUTATE_EDITORIAL_BODY_CONTRAST === '1') css += '\n.partner { --color-ice-100: #6b7480; }';
if (process.env.MUTATE_EDITORIAL_SHADE === '1') css = css.replace(/--page-body-shade\s*:\s*rgba\(5,\s*6,\s*9,\s*[\d.]+\)/g, '--page-body-shade: rgba(5, 6, 9, 0.2)');
if (process.env.MUTATE_EDITORIAL_MASK === '1') css += '\n.partner__body { mask-image: linear-gradient(#000, transparent); }';
if (process.env.MUTATE_EDITORIAL_META_USAGE === '1') partnerCss += '\n.partner__filemeta { color: var(--color-ice-800); }';

const allowed = new Set(['--color-ice-50', '--color-ice-100', '--color-ice-200']);
const definitions = `${theme}\n${css}`;
const tokenValue = token => [...definitions.matchAll(new RegExp(`${token}\\s*:\\s*#([\\da-f]{6})`, 'gi'))].at(-1)?.[1];
const roleToken = role => [...css.matchAll(new RegExp(`--page-${role}-colour\\s*:\\s*var\\((--[\\w-]+)\\)`, 'g'))].at(-1)?.[1];

test('the body, meta and list role tokens are bright allow-listed colours with calculated contrast', () => {
  for (const role of ['body', 'meta', 'list']) {
    const token = roleToken(role);
    assert.equal(allowed.has(token), true, `${role}: ${token ?? 'missing role token'}`);
    const hex = tokenValue(token);
    assert.equal(typeof hex, 'string', `${token} must be a shipped hex colour`);
    assert.ok(ratio(rgb(hex), rgb('050609')) >= (role === 'meta' ? 4.5 : 7), `${role} contrast on #050609`);
  }
});

test('editorial roles are used and feathering is confined to the single backdrop pseudo-element', () => {
  for (const role of ['body', 'meta', 'list']) {
    assert.equal(new RegExp(`color:\\s*var\\(--page-${role}-colour\\)`).test(css), true, `${role} must be used, not merely declared`);
  }
  for (const { selectors, declarations } of cssRules(css)) {
    const masks = [...declarations.matchAll(/(?:^|;)\s*(?:-webkit-)?mask(?:-image)?\s*:\s*([^;]+)/g)];
    if (masks.length === 0 || masks.every(([, value]) => value.trim() === 'none')) continue;
    for (const selector of selectorList(selectors)) assert.match(selector, /\.partner__body::before$/, `${selector} must not mask text or controls`);
  }
});

test('body, metadata and ledger CSS cannot bypass the contrast allow-list with faded tokens', () => {
  const knownColours = new Set([...allowed].map(token => tokenValue(token)?.toLowerCase()));
  const textSelector = /__stage\s+p|__meta\b|__dots\s+li|__filemeta\b|__label\b|__gamefacts\s+dt|__foot\b|__empty\b|__document\s+p|__announcement\b|__preview\b|editorial-chapter__kicker|editorial-counter__label|editorial-tech-strip|editorial-ledger/;
  for (const { selectors, declarations } of cssRules(`${css}\n${partnerCss}`)) {
    if (!textSelector.test(selectors)) continue;
    const colourToken = declarations.match(/(?:^|;)\s*color:\s*var\((--[\w-]+)\)/)?.[1];
    if (!colourToken) continue;
    const resolved = /^--page-(body|meta|list)-colour$/.exec(colourToken)?.[1];
    const colour = tokenValue(resolved ? roleToken(resolved) : colourToken)?.toLowerCase();
    assert.equal(knownColours.has(colour), true, `${selectors.trim()}: ${colourToken} must resolve to an allowed editorial text colour`);
  }
});

test('the continuous body backdrop meets the stronger body and list target over the existing white worst case', () => {
  const alpha = shadeAlpha(css);
  assert.ok(Number.isFinite(alpha), 'explicit body backdrop opacity must remain auditable');
  assert.ok(alpha >= 0.78 && alpha <= 0.86, 'backdrop transmits faint arena lines instead of becoming opaque');
  const composite = compositeShade([255, 255, 255], alpha);
  for (const role of ['body', 'meta', 'list']) {
    const hex = tokenValue(roleToken(role));
    assert.equal(typeof hex, 'string', `${role} colour exists`);
    const actual = ratio(rgb(hex), composite), minimum = role === 'meta' ? 4.5 : 7;
    assert.ok(actual >= minimum, `${role}: ${actual.toFixed(2)}:1 against white composited with the body backdrop`);
  }
});

test('the contrast calculation rejects a muted grey and accepts the shipped cool white', () => {
  assert.ok(ratio(rgb('555555'), rgb('050609')) < 4.5);
  assert.ok(ratio(rgb('f2f7fc'), rgb('050609')) > 7);
});
