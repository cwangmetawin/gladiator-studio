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

test('Netlify caches only asset bundles and baked WebP paths immutably; every existing setting is preserved', () => {
  const text = readFileSync(new URL('netlify.toml', root), 'utf8');
  const blocks = text.match(/\[\[headers\]\][\s\S]*?(?=\n\[\[|$(?![\s\S]))/g) ?? [];
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map(block => block.match(/for = "([^"]+)"/)[1]).sort(), ['/arena/games/*.webp', '/assets/*']);
  for (const block of blocks) {
    assert.match(block, /Cache-Control = "public, max-age=31536000, immutable"/);
    assert.equal(block.trim().split('\n').length, 4, 'no additional headers');
  }
  assert.equal(text.replace(/\n\[\[headers\]\][\s\S]*/, '').trim(), `[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200`);
});
