import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const { featuredGames, gameFacts, launchMonth } = await load('features/arena/hallCatalogue.ts');
const { hallOffset, hallScreens, hallTrackScreens, snapHall, followHall, HALL_SLICE } = await load('features/arena/hallProgress.ts');
const { slotTransform, frameRing, wrapSlot, mixTheme } = await load('features/arena/hallLayout.ts');
const slot = (id, extra = {}) => Object.freeze({ id, title: `Game ${id}`, category: 'slot', image: `/cover-${id}.jpg`, link: 'https://example.com/demo', timeline: '', ...extra });

test('featured games follow the published catalogue order, require slot cover art, deduplicate and cap at eight without mutating it', () => {
  const games = Object.freeze([slot(5), slot(3, { isPublished: false }), slot(2, { category: 'mini' }), slot(7, { image: '' }), slot(5), ...Array.from({ length: 12 }, (_, i) => slot(20 - i))]);
  const selected = featuredGames(games);
  assert.deepEqual(selected.map(g => g.id), [5, 20, 19, 18, 17, 16, 15, 14]);
  assert.equal(selected[0] === games[0], true);
  assert.deepEqual(featuredGames([]), []);
  assert.deepEqual(featuredGames([slot(1, { image: '/cover-horizontal.jpg' })]), []);
});

test('copy uses only supplied catalogue facts and valid release months, with no manufactured RTP or volatility', () => {
  assert.deepEqual(gameFacts(slot(1)), [{ label: 'Type', value: 'Slot' }]);
  assert.deepEqual(gameFacts(slot(1, { rtp: 95.12, volatility: 'HIGH' })), [
    { label: 'RTP', value: '95.12%' }, { label: 'Volatility', value: 'HIGH' }, { label: 'Type', value: 'Slot' },
  ]);
  for (const rtp of [undefined, NaN, Infinity, 0, -1, 101]) assert.equal(gameFacts(slot(1, { rtp })).some(f => f.label === 'RTP'), false);
  assert.equal(launchMonth('2025-12-01'), 'Dec 2025');
  for (const date of ['', 'bad', '2025-13-01', '2025-02-31']) assert.equal(launchMonth(date), '');
});

test('each additional game adds one fixed native scroll slice after the unchanged dive and arrival', () => {
  assert.equal(hallOffset(0, 8), 0);
  assert.equal(hallOffset(1.9, 8), 0);
  for (let i = 0; i < 8; i++) assert.ok(Math.abs(hallOffset(hallScreens(i, 8), 8) - i) < 1e-10);
  assert.equal(hallOffset(999, 8), 7);
  assert.equal(hallOffset(NaN, 8), 0);
  assert.equal(hallOffset(3, 0), 0);
  assert.equal(hallTrackScreens(1), 2.9);
  assert.ok(Math.abs(hallTrackScreens(8) - (2.9 + 7 * HALL_SLICE)) < 1e-12);
  assert.equal(hallOffset(1.9 + 1.6 * HALL_SLICE, 8, true), 2);
});

test('snapping waits for 200 ms of inactivity, never runs during drag, and visual damping responds on the first frame', () => {
  assert.equal(snapHall(2.45, 199, false, 8), null);
  assert.equal(snapHall(2.45, 200, true, 8), null);
  assert.equal(snapHall(2.45, 200, false, 8), 2);
  assert.equal(snapHall(2.55, 200, false, 8), 3);
  assert.equal(snapHall(7.9, 200, false, 8), 7);
  assert.equal(snapHall(2, 200, false, 8), null);
  assert.ok(followHall(0, 1, 1 / 60, false) > 0, 'moves within the first 16.7 ms frame');
  assert.equal(followHall(0, 3, 1 / 60, true), 3);
  assert.equal(followHall(0, 3, 0, false), 3, 'static render draws the requested position');
});

test('ring layout is symmetric with a large front slab and dark, softened, receding side slabs', () => {
  for (const phone of [false, true]) {
    const centre = slotTransform(0, phone), left = slotTransform(-1, phone), right = slotTransform(1, phone);
    assert.equal(centre.scale, 1.12);
    assert.equal(centre.brightness, 1);
    assert.equal(centre.blur, 0);
    assert.equal(left.x, -right.x); assert.equal(left.yaw, -right.yaw);
    assert.ok(right.z > centre.z && right.brightness < centre.brightness && right.blur > centre.blur);
    assert.equal(slotTransform(5, phone).alpha, 0);
    assert.ok(Object.values(right).every(Number.isFinite));
  }
  assert.ok(slotTransform(2, true).alpha < slotTransform(2, false).alpha);
  assert.equal(wrapSlot(-1, 8), -1);
  assert.equal(wrapSlot(7, 8), -1);
});

test('framing uses the existing camera: desktop main cover is at least half the viewport height, phones stay inside 82% width', () => {
  for (const [width, height] of [[1440, 900], [1024, 768], [1920, 1080], [320, 740], [390, 844], [844, 390]]) {
    const phone = width < 768;
    const frame = frameRing(width, height, 0.82, phone);
    assert.ok(Object.values(frame).every(Number.isFinite));
    const projectedHeight = frame.height * 1.12 / (frame.distance * 2 * Math.tan(0.82 / 2));
    const projectedWidth = projectedHeight * frame.aspect / (width / height);
    if (!phone) assert.ok(projectedHeight >= 0.5, `${width}x${height}: ${projectedHeight}`);
    else assert.ok(projectedWidth <= 0.821);
    assert.ok(frame.screenY < 0.43, 'space below for the title and actions');
  }
});

test('colour cross-fades complete at 600 ms, instantly under reduced motion, and never change the input arrays', () => {
  const a = Object.freeze([0.4, 0.5, 0.6]), b = Object.freeze([0.8, 0.2, 0.3]);
  assert.deepEqual(mixTheme(a, b, 0, false), a);
  assert.deepEqual(mixTheme(a, b, 600, false), b);
  assert.deepEqual(mixTheme(a, b, 1, true), b);
  assert.deepEqual(mixTheme(a, b, 300, false), [0.6000000000000001, 0.35, 0.44999999999999996]);
});
