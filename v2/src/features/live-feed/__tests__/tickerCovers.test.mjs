import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';
import { createHarness, findAll, harnessHooksUrl, textOf } from '../../../shared/__tests__/hookHarness.mjs';

const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const hooks = data(`export * from '${harnessHooksUrl(data)}'; export const memo = component => component;`);
const loader = extra => createLoader({
  react: hooks,
  './schemas': data('export const GameDataResponseSchema = {};'),
  './catalogueDb': data('export const fetchCatalogueFromDb = async () => null;'),
  ...extra,
});
const real = loader();
const { LiveTicker } = await real.load('features/live-feed/LiveTicker.tsx');
const { COVER_MANIFEST } = await real.load('features/arena/hallManifest.ts');
const { lookupGame } = await real.load('features/live-feed/liveCatalogue.ts');

function chipFor(Component, gameName) {
  const harness = createHarness(Component);
  harness.mount({ isConnected: true, events: [{ id: 'win', gameName, amount: 123, country: 'GB', provider: 'gladiator' }] });
  const track = findAll(harness.output, node => node.type?.name === 'TickerTrack')[0];
  const chip = findAll(track.type(track.props), node => node.type?.name === 'Chip')[0];
  const output = chip.type(chip.props);
  harness.unmount();
  return output;
}

test('the real ticker prefers bundled 320 px covers for both providers and socket aliases', () => {
  for (const [name, slug] of [['Eyes of Medusa', 'gladiator-eyes-of-medusa'], ['Blackjack', 'mw-blackjack'], ['maneater', 'gladiator-maneater']]) {
    const img = findAll(chipFor(LiveTicker, name), node => node.type === 'img')[0];
    assert.equal(img.props.src, COVER_MANIFEST.entries[slug].widths['320'].url);
    assert.equal(img.props.decoding, 'async');
    assert.equal(img.props.loading, 'lazy');
    assert.equal(img.props.alt, '');
    assert.equal(lookupGame(name).slug, slug, 'catalogue lookup preserves the baked-cover identity');
  }
});

test('a baked-image failure tries the original artwork once without a retry loop', () => {
  const img = findAll(chipFor(LiveTicker, 'Eyes of Medusa'), node => node.type === 'img')[0];
  const original = lookupGame('Eyes of Medusa').image;
  let src = img.props.src, writes = 0;
  const currentTarget = { getAttribute: () => src, set src(value) { src = value; writes += 1; } };
  assert.equal(typeof img.props.onError, 'function');
  img.props.onError({ currentTarget });
  assert.equal(src, original);
  img.props.onError({ currentTarget });
  assert.equal(writes, 1, 'the failing original is not requested repeatedly');
});

test('missing or changed manifest artwork keeps the original URL; unknown games keep their initial', async () => {
  for (const game of [
    { title: 'New Game', slug: 'new-game', image: '/new-game.jpg' },
    { title: 'New Game', slug: 'gladiator-eyes-of-medusa', image: '/replacement.jpg' },
  ]) {
    const { LiveTicker: ChangedTicker } = await loader({ '@/api/gameData': data(`export const GLADIATOR_SLOTS = ${JSON.stringify([game])}; export const METAWIN_ORIGINALS = [];`) })
      .load('features/live-feed/LiveTicker.tsx');
    const output = chipFor(ChangedTicker, game.title);
    assert.equal(findAll(output, node => node.type === 'img')[0].props.src, game.image);
    assert.equal(findAll(output, node => node.props?.className === 'ticker__game')[0].props.children, game.title);
  }
  const unknown = chipFor(LiveTicker, 'Uncatalogued');
  assert.equal(findAll(unknown, node => node.type === 'img').length, 0);
  assert.equal(textOf(findAll(unknown, node => node.props?.className === 'ticker__thumb')[0]), 'U');
});
