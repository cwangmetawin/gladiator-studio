import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const { featuredCatalogue } = await load('features/partner/partnerCatalogue.ts');
const { parseCoverManifest } = await load('features/arena/hallManifest.ts');
const manifest = parseCoverManifest(JSON.parse(readFileSync(new URL('../../../../public/arena/games/manifest.json', import.meta.url), 'utf8')));
const [slug, baked] = Object.entries(manifest.entries)[0];
const curated = Object.freeze([{ title: 'Example', slug, image: baked.source, category: 'slot', rtp: 99 }]);
const featured = Object.freeze([{ title: ' EXAMPLE ', genre: 'Edited genre', rtp: '99.5%' }]);

test('featured titles keep every edited label, use live RTP, and prefer matching baked phone/desktop covers', () => {
  const live = Object.freeze([{ ...curated[0], title: 'example', rtp: 94.23 }]);
  const phone = featuredCatalogue(featured, live, curated, manifest, true);
  const desktop = featuredCatalogue(featured, live, curated, manifest, false);
  assert.equal(phone[0].title, ' EXAMPLE ');
  assert.equal(phone[0].genre, 'Edited genre');
  assert.equal(phone[0].rtp, '94.2%');
  assert.equal(phone[0].cover.url, `/arena/games/${slug}-320.webp`);
  assert.equal(desktop[0].cover.url, `/arena/games/${slug}-640.webp`);
  assert.equal(featured[0].rtp, '99.5%');
});

test('a replaced live cover never uses stale baked/curated art; a missing bake retains the catalogue image', () => {
  const live = [{ ...curated[0], image: '/changed.webp', rtp: 0 }];
  const changed = featuredCatalogue(featured, live, curated, manifest, false)[0];
  assert.equal(changed.cover.url, '/changed.webp');
  assert.equal(changed.rtp, '0%');
  assert.equal(featuredCatalogue(featured, curated, curated, null, false)[0].cover.url, baked.source);
});

test('unmatched admin titles still have text and category RTP without invented art; blank rows are omitted', () => {
  const items = featuredCatalogue([{ title: 'New', category: 'mini', rtp: '99%', genre: 'Edited' }, { title: ' ' }, null], [], curated, manifest, true);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'New');
  assert.equal(items[0].rtp, '97%');
  assert.equal(items[0].cover, null);
  assert.deepEqual(featuredCatalogue([], [], [], manifest, false), []);
});
