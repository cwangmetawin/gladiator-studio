import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const { parseCoverManifest, coverForGame, COVER_MANIFEST, STEEL_THEME } = await load('features/arena/hallManifest.ts');
const game = Object.freeze({ id: 1, slug: 'new-slot', title: 'A new slot', image: 'https://content.prod.platform.mwapp.io/games/new.jpg' });
const entry = () => ({ source: game.image, primary: [0.2, 0.6, 0.4], secondary: [0.8, 0.5, 0.1], widths: {
  '320': { url: '/arena/games/new-slot-320-0123abcd.webp', width: 320, height: 429, bytes: 12000 },
  '640': { url: '/arena/games/new-slot-640-0123abcd.webp', width: 640, height: 858, bytes: 36000 },
} });
const manifest = value => parseCoverManifest({ version: 1, entries: { 'new-slot': value } });

test('manifest mapping picks the small phone cover and the desktop cover without changing catalogue metadata', () => {
  const data = manifest(entry());
  const phone = coverForGame(game, data, true), desktop = coverForGame(game, data, false);
  assert.equal(phone.url, '/arena/games/new-slot-320-0123abcd.webp');
  assert.equal(desktop.url, '/arena/games/new-slot-640-0123abcd.webp');
  assert.equal(phone.width, 320); assert.equal(desktop.height, 858);
  assert.equal(phone.fallbackUrl, game.image);
  assert.deepEqual(desktop.primary, entry().primary);
  assert.deepEqual(coverForGame({ ...game, rtp: 90 }, data, true), phone, 'baked art cannot override catalogue facts');
});

test('new, missing or changed cover art uses its catalogue URL and neutral steel colours', () => {
  for (const data of [null, parseCoverManifest({ version: 1, entries: {} }), parseCoverManifest({ version: 999, entries: {} })]) {
    const cover = coverForGame(game, data, true);
    assert.equal(cover.url, game.image); assert.deepEqual(cover.primary, STEEL_THEME.primary);
  }
  const cover = coverForGame({ ...game, image: '/replacement.jpg' }, manifest(entry()), false);
  assert.equal(cover.url, '/replacement.jpg');
  assert.deepEqual(cover.primary, STEEL_THEME.primary);
});

test('bad manifest entries fail locally and cannot introduce off-origin baked textures or invalid colours', () => {
  const cases = [
    { ...entry(), primary: [NaN, 0, 1] }, { ...entry(), secondary: [-1, 0, 1] },
    { ...entry(), primary: [0, 1] }, { ...entry(), widths: {} },
    { ...entry(), widths: { ...entry().widths, '320': { ...entry().widths['320'], url: 'https://untrusted.example/image.webp' } } },
    { ...entry(), widths: { ...entry().widths, '640': { ...entry().widths['640'], height: 0 } } },
    { ...entry(), widths: { ...entry().widths, '320': { ...entry().widths['320'], url: '/arena/games/new-slot-320.webp' } } },
    { ...entry(), widths: { ...entry().widths, '320': { ...entry().widths['320'], url: '/arena/games/other-320-0123abcd.webp' } } },
    { ...entry(), widths: { ...entry().widths, '320': { ...entry().widths['320'], url: '/arena/games/new-slot-320-0123abcd.webp?other=1' } } },
  ];
  for (const value of cases) assert.equal(coverForGame(game, manifest(value), false).url, game.image);
  for (const value of [null, [], {}, { version: 1, entries: null }]) assert.equal(parseCoverManifest(value), null);
});

test('the bundled manifest selects curated art synchronously and retains live-image and unbaked fallbacks', () => {
  const live = { slug: 'gladiator-eyes-of-medusa', image: 'https://content.prod.platform.mwapp.io/games/eyes-of-medusa-vertical.jpg' };
  const cover = coverForGame(live, COVER_MANIFEST, true);
  assert.match(cover.url, /\/gladiator-eyes-of-medusa-320-[a-f0-9]{8}\.webp$/);
  assert.equal(cover instanceof Promise, false);
  assert.equal(coverForGame({ ...live, image: '/new.jpg' }, COVER_MANIFEST, false).url, '/new.jpg');
  assert.equal(coverForGame({ ...live, slug: 'new-admin' }, COVER_MANIFEST, false).url, live.image);
  assert.equal(coverForGame({}, COVER_MANIFEST, false).url, '');
});
