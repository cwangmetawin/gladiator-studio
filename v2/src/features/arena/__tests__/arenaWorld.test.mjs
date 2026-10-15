import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const geometry = await load('features/arena/colosseumGeometry.ts');
const { createArenaWorld } = await load('features/arena/arenaWorld.ts');
const { crossingFlash } = await load('features/arena/diveFlash.ts');
const { helmetMouthY } = await load('features/arena/cameraTrack.ts');
const { parseEmblem } = await load('features/arena/emblemFormat.ts');
const B = await load('shared/babylon/babylonCore.ts');
const A = await load('features/arena/arenaCore.ts');

test('the two arcade tiers, attic, cornices and nine seating rings stay deterministic and within the arena bounds', () => {
  for (const bays of [40, 64]) {
    const a = geometry.colosseumLines(bays), b = geometry.colosseumLines(bays);
    assert.deepEqual(a, b);
    assert.equal(a.filter(line => line.kind === 'arcade').length, bays * 4);
    assert.equal(a.filter(line => line.kind === 'attic').length, bays / 2);
    assert.equal(a.filter(line => line.kind === 'cornice').length, 6);
    assert.equal(a.filter(line => line.kind === 'seating').length, 9);
    const points = a.flatMap(line => line.points);
    assert.ok(points.every(point => point.every(Number.isFinite)));
    assert.ok(points.every(([x, y, z]) => Math.hypot(x, z - 34) <= 24.001 && y >= -2.6 && y <= 8.151));
    assert.ok(points.length < 12000, 'one static line buffer, no individual arch meshes');
  }
  assert.throws(() => geometry.colosseumLines(0), /bays/i);
});

test('star buffers are seeded, bounded and the phone uses fewer sprites', () => {
  const phone = geometry.arenaStars(1200), desktop = geometry.arenaStars(2600);
  assert.deepEqual(phone, geometry.arenaStars(1200));
  assert.equal(phone.positions.length, 1200 * 4 * 3);
  assert.equal(desktop.indices.length, 2600 * 6);
  assert.ok(phone.positions.every(Number.isFinite));
  for (let i = 0; i < phone.positions.length; i += 3) {
    assert.ok(Math.abs(Math.hypot(...phone.positions.slice(i, i + 3)) - 600) < 0.001);
    assert.ok(phone.positions[i + 1] > 0, 'stars stay above the bowl');
  }
});

test('the mouth waypoint is below the visor and inside the baked helmet opening', () => {
  const bytes = readFileSync(new URL('../../../../public/arena/emblem.bin', import.meta.url));
  const asset = parseEmblem(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const positions = asset.cap.positions, mouth = helmetMouthY(positions);
  assert.ok(mouth < -0.5 && mouth > -1.2);
  // A vertical ray through the centre of the mouth must miss every front triangle.
  let hits = 0;
  for (let i = 0; i < asset.cap.indices.length; i += 3) {
    const points = [...asset.cap.indices.slice(i, i + 3)].map(index => [positions[index * 3], positions[index * 3 + 1]]);
    const signs = points.map(([x, y], j) => {
      const [nx, ny] = points[(j + 1) % 3];
      return (nx - x) * (mouth - y) - (ny - y) * -x;
    });
    if (signs.every(s => s > 1e-9) || signs.every(s => s < -1e-9)) hits++;
  }
  assert.equal(hits, 0, 'the camera crosses empty space rather than steel');
});

test('desktop crossing flash is brief and deterministic; phones and reduced motion have none', () => {
  assert.ok(crossingFlash(0.69 * 0.9, false, false) > 0.9);
  for (const screens of [0, 0.4, 0.9, 1.4, 1.9]) assert.equal(crossingFlash(screens, false, false), 0);
  for (let i = 0; i <= 190; i++) {
    assert.equal(crossingFlash(i / 100, true, false), 0);
    assert.equal(crossingFlash(i / 100, false, true), 0);
  }
});

test('the arena builds on the supplied scene/engine, phone geometry is lighter, and disposal releases every owned resource', () => {
  const engine = new NullEngine();
  try {
    for (const phone of [false, true]) {
      const scene = new B.Scene(engine);
      const camera = new A.FreeCamera('test', new B.Vector3(0, 3, 16), scene);
      const world = createArenaWorld(B, A, scene, phone);
      assert.equal(engine.scenes.length, 1, 'world adds no engine or scene');
      assert.equal(world.meshes.length, 3, 'one line mesh, one star mesh and one floor mesh');
      const arches = scene.getMeshByName('arenaColosseum');
      assert.ok(arches.getTotalVertices() < (phone ? 7000 : 11000));
      assert.equal(scene.getMeshByName('arenaStars').getTotalVertices(), (phone ? 1200 : 2600) * 4);
      world.update({ fade: 1, night: 1, time: 2, camera });
      assert.ok(world.meshes.every(mesh => mesh.isVisible));
      world.update({ fade: 0, night: 0, time: 2, camera });
      assert.ok(world.meshes.every(mesh => !mesh.isVisible));
      world.dispose();
      assert.equal(scene.meshes.length, 0);
      assert.equal(scene.materials.filter(material => material.name.startsWith('arena')).length, 0);
      assert.equal(scene.layers.length, 0);
      assert.equal(scene.textures.length, 0);
      scene.dispose();
    }
  } finally { engine.dispose(); }
});
