import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './loadTs.mjs';
import { moduleUrl } from './sourceModule.mjs';
import { createHarness, findAll, harnessHooksUrl } from './hookHarness.mjs';
import { loadCuratedCatalogue } from './ageGateModules.mjs';

const hooks = moduleUrl(`export * from '${harnessHooksUrl(moduleUrl)}'; export default { memo: component => component };`);
const visual = moduleUrl(`export const motion = { div: 'div', button: 'button' };
  export const useMotionValue = value => ({ get: () => value, set() {} }), useSpring = value => value;
  export const useTransform = (_value, _from, to) => to[0], useMotionTemplate = () => '', useIsPresent = () => true;`);
const empty = moduleUrl('export const X = () => null, ChevronLeft = X, ChevronRight = X, Play = X, LayoutGrid = X, Layers = X;');
const { load } = createLoader({ react: hooks, 'framer-motion': visual, 'lucide-react': empty,
  './coverflow.css': moduleUrl(''),
  '@/shared/utils/soundEngine': moduleUrl('export const soundEngine = { click() {}, catalogueFocus() {} };'),
  '@/shared/hooks/useDialogFocus': moduleUrl('export const useDialogFocus = () => ({ current: null });'),
  '@/shared/motion/panelMotion': moduleUrl('export const PanelMotionContext = { Provider: "section" };'),
  '@/shared/ui/Reveal': moduleUrl('export const Reveal = "div";'),
  '@/features/starfield/skyStore': moduleUrl('export const skyStore = { focusGame() {}, releaseDrag() {} };'),
});
const { GameCard, FeaturedCard } = await load('features/games/GameCard.tsx');
const { GameCoverflow } = await load('features/games/GameCoverflow.tsx');
const { initialTransition } = await load('shared/motion/transition.ts');
const games = await loadCuratedCatalogue();
const image = harness => findAll(harness.output, node => node.type === 'img')[0];

function viewport(phone) {
  const saved = globalThis.window;
  globalThis.window = { innerWidth: phone ? 390 : 1280,
    matchMedia: () => ({ matches: phone, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
  };
  return () => { if (saved === undefined) delete globalThis.window; else globalThis.window = saved; };
}

function cardHarness(kind, game) {
  if (kind !== 'deck') {
    const harness = createHarness(kind === 'featured' ? FeaturedCard : GameCard);
    harness.mount({ game, onPlayGame() {} });
    return harness;
  }
  const parent = createHarness(GameCoverflow);
  parent.mount({ games: [game], loading: false, suspended: false, onClose() {}, returnFocusRef: { current: null }, narrative: initialTransition('reduced') });
  const card = findAll(parent.output, node => node.type?.name === 'DeckCard')[0];
  assert.ok(card, 'the shipped coverflow must contain the real deck card');
  const harness = createHarness(card.type);
  harness.mount(card.props);
  const unmount = harness.unmount;
  harness.unmount = () => { unmount(); parent.unmount(); };
  return harness;
}

for (const kind of ['card', 'featured', 'deck']) {
  for (const phone of [true, false]) {
    test(`the shipped ${kind} uses ${phone ? 320 : 640}px baked portraits, then the original once on error`, () => {
      const restore = viewport(phone), game = games[kind === 'deck' ? 12 : 0];
      const harness = cardHarness(kind, game);
      try {
        assert.match(image(harness).props.src, new RegExp(`/arena/games/${game.slug}-${phone ? 320 : 640}-[a-f0-9]{8}\\.webp$`));
        harness.act(() => image(harness).props.onError());
        assert.equal(image(harness).props.src, game.image);
        harness.act(() => image(harness).props.onError());
        assert.equal(image(harness), undefined, 'an original failure ends at the existing placeholder');
        harness.act(() => {});
        assert.equal(image(harness), undefined, 'failed images must not loop');
      } finally { harness.unmount(); restore(); }
    });
  }
}

test('live image changes recover from a failed portrait and never show stale baked art', () => {
  const restore = viewport(false), game = games[0], harness = cardHarness('card', game);
  try {
    harness.act(() => image(harness).props.onError());
    const changed = { ...game, image: 'https://example.com/replacement.jpg' };
    harness.update({ game: changed, onPlayGame() {} });
    assert.equal(image(harness).props.src, changed.image);
    harness.act(() => image(harness).props.onError());
    assert.equal(image(harness), undefined);
    harness.update({ game, onPlayGame() {} });
    assert.match(image(harness).props.src, /-640-[a-f0-9]{8}\.webp$/);
  } finally { harness.unmount(); restore(); }
});

test('the featured landscape hero remains first and its failure steps through baked portrait, original and placeholder', () => {
  const restore = viewport(false), game = games[0], heroImage = '/hero.jpg';
  const harness = createHarness(FeaturedCard);
  try {
    harness.mount({ game, heroImage, onPlayGame() {} });
    assert.equal(image(harness).props.src, heroImage);
    harness.act(() => image(harness).props.onError());
    assert.match(image(harness).props.src, /-640-[a-f0-9]{8}\.webp$/);
    harness.act(() => image(harness).props.onError());
    assert.equal(image(harness).props.src, game.image);
    harness.act(() => image(harness).props.onError());
    assert.equal(image(harness), undefined);
  } finally { harness.unmount(); restore(); }
});
