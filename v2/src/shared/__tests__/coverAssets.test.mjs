import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { loadCuratedCatalogue } from './ageGateModules.mjs';
import { createLoader } from './loadTs.mjs';

const games = await loadCuratedCatalogue();
const root = new URL('../../../', import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const bundled = () => readJson('src/features/arena/gameCovers.json');

test('every curated portrait has bundled 320/640 WebP content hashes and no stale public covers remain', () => {
  const manifest = bundled(), expected = [];
  assert.equal(games.filter(game => game.image).length, 38);
  assert.deepEqual(Object.keys(manifest.entries), games.filter(game => game.image).map(game => game.slug));
  for (const game of games.filter(game => game.image)) {
    const entry = manifest.entries[game.slug];
    assert.equal(entry.source, game.image);
    for (const width of [320, 640]) {
      const size = entry.widths[width];
      assert.match(size.url, new RegExp(`^/arena/games/${game.slug}-${width}-[a-f0-9]{8}\\.webp$`));
      const name = size.url.split('/').at(-1), bytes = readFileSync(new URL(`public${size.url}`, root));
      const hash = createHash('sha256').update(bytes).digest('hex');
      assert.equal(size.width, width);
      assert.equal(size.bytes, bytes.length);
      assert.equal(size.sha256, hash);
      assert.ok(name.endsWith(`-${hash.slice(0, 8)}.webp`));
      expected.push(name);
    }
  }
  assert.deepEqual(readdirSync(new URL('public/arena/games/', root)).sort(), expected.sort());
  assert.equal(existsSync(new URL('public/arena/games/manifest.json', root)), false);
});

test('the expanded bake preserves the original hall selection, contrast order, palettes and slot image bytes', async () => {
  const manifest = bundled();
  const baseline = readJson('src/features/arena/__tests__/hallCoverBaseline.json');
  const { featuredGames } = await createLoader().load('features/arena/hallCatalogue.ts');
  assert.deepEqual(featuredGames(games).map(game => game.slug), baseline.featured);
  assert.deepEqual(manifest.contrastOrder, baseline.contrastOrder);
  for (const [slug, previous] of Object.entries(baseline.entries)) {
    const entry = manifest.entries[slug];
    for (const key of ['source', 'primary', 'secondary']) assert.deepEqual(entry[key], previous[key], `${slug}: ${key}`);
    for (const width of [320, 640]) {
      const { url: _url, ...size } = entry.widths[width];
      assert.deepEqual(size, previous.widths[width], `${slug}: ${width} bytes and dimensions`);
    }
  }
});

test('Netlify caches only hashed bundles and baked covers immutably, through public/_headers', () => {
  // The site's Netlify build reads public/_redirects and public/_headers; it never read v2/netlify.toml's headers
  // (its deploy check said "No header rules processed"), so the rules live next to _redirects.
  const headers = readFileSync(new URL('public/_headers', root), 'utf8');
  assert.equal(headers.trim(), [
    '/assets/*', '  Cache-Control: public, max-age=31536000, immutable',
    '/arena/games/*', '  Cache-Control: public, max-age=31536000, immutable',
  ].join('\n'));
  // Immutable is only safe because every file in that folder carries its content hash.
  for (const file of readdirSync(new URL('public/arena/games/', root))) {
    assert.match(file, /^[a-z0-9]+(?:-[a-z0-9]+)*-(?:320|640)-[0-9a-f]{8}\.webp$/, `${file} must be a hashed cover`);
  }
  assert.doesNotMatch(readFileSync(new URL('netlify.toml', root), 'utf8'), /\[\[headers\]\]/);
});
