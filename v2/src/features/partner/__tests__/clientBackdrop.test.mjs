import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const bake = new URL('../../../../scripts/bake-client-backdrop.mjs', import.meta.url);
const { bakeBackdrop, projectSegment, finalCamera, WIDTH, HEIGHT } = await import(bake);
const { load } = createLoader();
const { createCameraTrack } = await load('features/arena/cameraTrack.ts');
const { JOURNEY_SCREENS } = await load('features/arena/journeyProgress.ts');

test('the bake samples the real final camera, independent of the emblem framing', async () => {
  for (const frame of [
    { distance: 9, offsetX: 0, offsetY: 0.8, fov: 0.62, mouthY: -0.75 },
    { distance: 23, offsetX: 0.1, offsetY: 1.6, fov: 0.9, mouthY: -0.75 },
  ]) assert.deepEqual(await finalCamera(frame), createCameraTrack(frame)(JOURNEY_SCREENS));
});

test('projection clips near-plane crossings and every viewport edge, without joining unrelated lines', () => {
  const camera = { x: 0, y: 0, z: 0, fov: Math.PI / 2, pitch: 0 };
  const centre = projectSegment([0, 0, 1], [0, 0, 2], camera, 200, 100);
  assert.deepEqual(centre, [[100, 50], [100, 50]]);
  assert.equal(projectSegment([0, 0, -2], [1, 0, -1], camera, 200, 100), null);
  for (const [a, b] of [
    [[-99, 0, 1], [99, 0, 1]], [[0, -99, 1], [0, 99, 1]],
    [[0, 0, -1], [0.2, 0.1, 1]],
  ]) {
    const segment = projectSegment(a, b, camera, 200, 100);
    assert.ok(segment);
    for (const [x, y] of segment) assert.ok(Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 200 && y >= 0 && y <= 100);
  }
});

test('the pitched perspective agrees with Babylon left-handed view/projection maths', async () => {
  const { Matrix, Vector3 } = await import('@babylonjs/core/Maths/math.vector.js');
  const camera = await finalCamera(), eye = new Vector3(camera.x, camera.y, camera.z);
  const target = eye.add(new Vector3(0, -Math.sin(camera.pitch), Math.cos(camera.pitch)));
  const matrix = Matrix.LookAtLH(eye, target, Vector3.Up()).multiply(Matrix.PerspectiveFovLH(camera.fov, WIDTH / HEIGHT, 0.1, 1000));
  const segment = projectSegment([0, 0, 34], [2, 5, 36], camera);
  for (const [index, point] of [[0, [0, 0, 34]], [1, [2, 5, 36]]]) {
    const p = Vector3.TransformCoordinates(new Vector3(...point), matrix);
    assert.ok(Math.abs(segment[index][0] - (p.x + 1) * WIDTH / 2) < 0.001);
    assert.ok(Math.abs(segment[index][1] - (1 - p.y) * HEIGHT / 2) < 0.001);
  }
});

test('the shipped SVG is deterministic, bounded, stroke-only and sourced from the actual arena', async () => {
  const svg = await bakeBackdrop();
  assert.equal(await bakeBackdrop(), svg);
  assert.equal(readFileSync(new URL('../../../../public/arena/client-backdrop.svg', import.meta.url), 'utf8'), svg);
  assert.match(svg, new RegExp(`viewBox="0 0 ${WIDTH} ${HEIGHT}"`));
  assert.match(svg, /fill="none"/);
  assert.match(svg, /stroke="#7fb3d6"/);
  assert.match(svg, /stroke-width="1\.4"/);
  assert.doesNotMatch(svg, /NaN|Infinity|<image|<script|<filter|<foreignObject/);
  assert.ok(svg.length < 60000, `${svg.length} bytes`);
  const commands = [...svg.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)];
  assert.ok(commands.length > 150, 'recognisable arches, cornices and seating');
  for (const [, x, y] of commands) assert.ok(+x >= 0 && +x <= WIDTH && +y >= 0 && +y <= HEIGHT);
});

test('--check detects a stale or absent artifact without overwriting it; the bake works from another cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'client-backdrop-'));
  const output = join(dir, 'arena.svg');
  const run = (...args) => spawnSync(process.execPath, [bake.pathname, '--output', output, ...args], { cwd: dir, encoding: 'utf8' });
  try {
    assert.equal(run('--check').status, 1);
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(run('--check').status, 0);
    writeFileSync(output, '<svg/>');
    assert.equal(run('--check').status, 1);
    assert.equal(readFileSync(output, 'utf8'), '<svg/>');
    assert.notEqual(run('--unknown').status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
