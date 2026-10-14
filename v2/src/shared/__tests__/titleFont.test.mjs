// Run with npm run test:unit. The gate title's face ships from this site and is preloaded.
// Why (Phase 4 M0): the gate's LCP element is its title. Set in Saira from Google Fonts, the
// title waited for a cross-origin stylesheet and then a font file, and swapped from its fallback
// late: on a remote Lighthouse A/B the preview's Speed Index was 10.3 s against production's 4.6 s.
// Served from public/ and preloaded in <head>, the face is there before the first paint.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../../', import.meta.url); // v2/
const html = readFileSync(new URL('index.html', root), 'utf8');
const css = readFileSync(new URL('src/shared/components/ageGate.css', root), 'utf8');

const attr = (tag, name) => new RegExp(`\\b${name}(?:="([^"]*)")?`).exec(tag);
const fontPreloads = [...html.matchAll(/<link\b[^>]*\brel="preload"[^>]*>/g)]
  .map(([tag]) => tag)
  .filter(tag => attr(tag, 'as')?.[1] === 'font');

test('index.html preloads the title face from this site, as a CORS font request', () => {
  assert.equal(fontPreloads.length, 1, 'one preloaded font: the gate title');
  const [tag] = fontPreloads;
  const href = attr(tag, 'href')?.[1];
  assert.equal(attr(tag, 'type')?.[1], 'font/woff2');
  // Fonts are always fetched in CORS mode; a preload without crossorigin is fetched twice.
  assert.ok(attr(tag, 'crossorigin'), 'the preload carries crossorigin');
  assert.ok(href?.startsWith('/') && !href.startsWith('//'), `${href} is a same-origin path`);
  assert.ok(existsSync(new URL(`public${href}`, root)), `${href} is in public/`);
  assert.ok(existsSync(new URL('public/fonts/OFL.txt', root)), 'the SIL Open Font License ships with the font');
});

test('the CSP lets the page load fonts from its own origin', () => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
  const fontSrc = csp.split(';').map(part => part.trim()).find(part => part.startsWith('font-src')) ?? '';
  assert.match(fontSrc, /'self'/, fontSrc);
});

test('the gate title is set in the self-hosted face, declared from the preloaded file', () => {
  const href = attr(fontPreloads[0] ?? '', 'href')?.[1];
  const face = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => body)
    .find(body => /font-family:\s*'Saira Title'/.test(body));
  assert.ok(face, "ageGate.css declares @font-face 'Saira Title'");
  assert.ok(face.includes(`url('${href}')`), `the face loads ${href}`);
  assert.match(face, /font-weight:\s*800/);
  assert.match(face, /font-display:\s*swap/);
  const title = /\.gate__title\s*{([^}]*)}/.exec(css)?.[1] ?? '';
  assert.match(title, /font-family:\s*'Saira Title',/, 'the title asks for the self-hosted face first');
});
