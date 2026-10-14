// Run with npm run test:unit. The site icon must be a real file that ships from public/.
// Why (Phase 4 M0): index.html pointed at /logo.svg, which never existed, so production answered
// the browser's icon request with the home page's HTML and every tab showed a blank icon.
// MUTATE_ICON_HREF=/logo.svg restores the old link (red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../../', import.meta.url); // v2/
let html = readFileSync(new URL('index.html', root), 'utf8');
if (process.env.MUTATE_ICON_HREF) {
  const target = /(<link rel="icon"[^>]*href=")[^"]+/;
  assert.match(html, target, 'icon mutation target not found');
  html = html.replace(target, `$1${process.env.MUTATE_ICON_HREF}`);
}

const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const iconLinks = text => [...text.matchAll(/<link\b[^>]*\brel="(?:shortcut )?icon"[^>]*>/g)]
  .map(([tag]) => ({ tag, href: attr(tag, 'href'), type: attr(tag, 'type') }));

test('every icon link in index.html points at a file that exists in public/', () => {
  const links = iconLinks(html);
  assert.ok(links.length >= 1, 'index.html declares an icon');
  for (const { href } of links) {
    assert.ok(href && href.startsWith('/') && !href.startsWith('//'), `${href} is a same-origin path`);
    assert.ok(existsSync(new URL(`public${href}`, root)), `${href} is not in public/, so production would answer it with the home page`);
  }
});

test('the icon is the helmet-only brand SVG, declared as such, and not the Rise of Cetus game badge', () => {
  const [link] = iconLinks(html);
  assert.equal(link.type, 'image/svg+xml');
  assert.ok(link.href.endsWith('.svg'));
  assert.doesNotMatch(link.href, /logo\.png/);
  const svg = readFileSync(new URL(`public${link.href}`, root), 'utf8');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[-\d. ]+">/);
  assert.equal(svg.match(/<path\b/g)?.length, 1, 'one path: the four helmet pieces');
  assert.doesNotMatch(svg, /<(?:text|image|script|style|foreignObject)\b/i);
  assert.ok(svg.length < 4096, `${svg.length} bytes: an icon is small`);
  // Legible on a light and a dark tab bar: an opaque dark tile behind an ice-white helmet.
  assert.match(svg, /<rect [^>]*fill="#0A0B12"/);
  assert.match(svg, /<path fill="#F2F7FC"/);
});

test('the icon and the gate emblem are generated from public/gladiator-logo.svg and are not stale', async () => {
  const { buildEmblem, buildFavicon, emblemModule } = await import(new URL('scripts/emblem.mjs', root));
  const emblem = buildEmblem(readFileSync(new URL('public/gladiator-logo.svg', root), 'utf8'));
  assert.equal(readFileSync(new URL('public/favicon.svg', root), 'utf8'), buildFavicon(emblem), 'run: node scripts/emblem.mjs');
  assert.equal(readFileSync(new URL('src/shared/brand/emblemPaths.ts', root), 'utf8'), emblemModule(emblem), 'run: node scripts/emblem.mjs');
});

test('the icon check catches the old broken link', () => {
  const [old] = iconLinks('<link rel="icon" type="image/svg+xml" href="/logo.svg" />');
  assert.equal(old.href, '/logo.svg');
  assert.equal(existsSync(new URL(`public${old.href}`, root)), false, '/logo.svg is still not a file in public/');
});
