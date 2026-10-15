import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const theme = source('shared/design/theme.css');
let partnerCss = source('features/partner/partner.css');
let css = source('features/arena-page/arenaPage.css');
if (process.env.MUTATE_EDITORIAL_TOKEN === '1') css = css.replace(/(--page-meta-colour\s*:)\s*var\(--color-ice-200\)/, '$1 var(--color-ice-400)');
if (process.env.MUTATE_EDITORIAL_BODY_CONTRAST === '1') css += '\n.partner { --color-ice-100: #6b7480; }';
if (process.env.MUTATE_EDITORIAL_SHADE === '1') css = css.replace(/--page-copy-shade\s*:\s*rgba\(5,\s*6,\s*9,\s*[\d.]+\)/g, '--page-copy-shade: rgba(5, 6, 9, 0.2)');
if (process.env.MUTATE_EDITORIAL_MASK === '1') css += '\n.arena-page .partner__shade { mask-image: radial-gradient(#000, transparent); }';
if (process.env.MUTATE_EDITORIAL_META_USAGE === '1') partnerCss += '\n.partner__filemeta { color: var(--color-ice-800); }';

const allowed = new Set(['--color-ice-50', '--color-ice-100', '--color-ice-200']);
const rgb = hex => hex.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16));
const luminance = channels => channels.map(value => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const ratio = (foreground, background) => {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const definitions = `${theme}\n${css}`;
const tokenValue = token => [...definitions.matchAll(new RegExp(`${token}\\s*:\\s*#([\\da-f]{6})`, 'gi'))].at(-1)?.[1];
const roleToken = role => [...css.matchAll(new RegExp(`--page-${role}-colour\\s*:\\s*var\\((--[\\w-]+)\\)`, 'g'))].at(-1)?.[1];

test('the body, meta and list role tokens are bright allow-listed colours with calculated contrast', () => {
  for (const role of ['body', 'meta', 'list']) {
    const token = roleToken(role);
    assert.equal(allowed.has(token), true, `${role}: ${token ?? 'missing role token'}`);
    const hex = tokenValue(token);
    assert.equal(typeof hex, 'string', `${token} must be a shipped hex colour`);
    assert.ok(ratio(rgb(hex), rgb('050609')) >= (role === 'body' ? 7 : 4.5), `${role} contrast on #050609`);
  }
});

test('the editorial roles are applied to body, metadata and list text', () => {
  for (const role of ['body', 'meta', 'list']) {
    assert.equal(new RegExp(`color:\\s*var\\(--page-${role}-colour\\)`).test(css), true, `${role} must be used, not merely declared`);
  }
  assert.equal(/mask(?:-image)?\s*:[^;}]*radial-gradient/i.test(css), false, 'copy shade must not fade its edges with a radial mask');
});

test('body, metadata and ledger CSS cannot bypass the contrast allow-list with faded tokens', () => {
  const knownColours = new Set([...allowed].map(token => tokenValue(token)?.toLowerCase()));
  const textSelector = /__stage\s+p|__meta\b|__dots\s+li|__filemeta\b|__label\b|__gamefacts\s+dt|__foot\b|__empty\b|__document\s+p|__announcement\b|__preview\b|editorial-chapter__kicker|editorial-counter__label|editorial-tech-strip|editorial-ledger/;
  for (const [, selectors, declarations] of `${css}\n${partnerCss}`.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!textSelector.test(selectors)) continue;
    const colourToken = declarations.match(/(?:^|;)\s*color:\s*var\((--[\w-]+)\)/)?.[1];
    if (!colourToken) continue;
    const resolved = /^--page-(body|meta|list)-colour$/.exec(colourToken)?.[1];
    const colour = tokenValue(resolved ? roleToken(resolved) : colourToken)?.toLowerCase();
    assert.equal(knownColours.has(colour), true, `${selectors.trim()}: ${colourToken} must resolve to an allowed editorial text colour`);
  }
});

test('the retained copy shade supports bright text even over a white arena frame', () => {
  const alpha = Number(css.match(/--page-copy-shade\s*:\s*rgba\(5,\s*6,\s*9,\s*([\d.]+)\)/)?.[1]);
  assert.ok(Number.isFinite(alpha), 'explicit copy shade opacity must remain auditable');
  const composite = rgb('050609').map(channel => channel * alpha + 255 * (1 - alpha));
  for (const role of ['body', 'meta', 'list']) {
    const hex = tokenValue(roleToken(role));
    assert.equal(typeof hex, 'string', `${role} colour exists`);
    assert.ok(ratio(rgb(hex), composite) >= 4.5, `${role} contrast against white composited with the copy shade`);
  }
});

test('the contrast calculation rejects a muted grey and accepts the shipped cool white', () => {
  assert.ok(ratio(rgb('555555'), rgb('050609')) < 4.5);
  assert.ok(ratio(rgb('f2f7fc'), rgb('050609')) > 7);
});
