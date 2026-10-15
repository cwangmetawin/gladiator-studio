// Run with npm run test:unit. The studio environment the steel reflects (public/arena/studio.env) is baked in a real
// browser by scripts/bake-env.mjs, so these tests do not rebuild it: they check that the recipe has not changed since
// it was baked (hashes recorded next to it) and that Babylon itself reads the file as the cube the page expects.
// MUTATE_ENV_RECIPE=1 pretends the recipe changed (red): re-bake with `node scripts/bake-env.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ENV_CUBE_SIZE, ENV_FILE, ENV_RECORD, envRecipe } from '../../../../scripts/bake-env.mjs';

const root = new URL('../../../../', import.meta.url);
const record = JSON.parse(readFileSync(new URL(ENV_RECORD, root), 'utf8'));
const bytes = readFileSync(new URL(ENV_FILE, root));

test('the baked environment still matches its recipe (a changed recipe needs a re-bake)', () => {
  const now = envRecipe(root);
  const expected = process.env.MUTATE_ENV_RECIPE === '1' ? { ...now, hdr: `${now.hdr}x` } : now;
  assert.equal(record.cube, expected.cube);
  assert.equal(record.recipe, expected.recipe, 'scripts/arena/env.mjs or env-page.mjs changed since the .env was baked');
  assert.equal(record.hdr, expected.hdr, 'the .hdr the recipe makes changed since the .env was baked');
  assert.equal(record.bytes, bytes.length);
});

test('Babylon reads the file as a prefiltered cube of the recorded size, PNG mips, six faces per level', async () => {
  const require = createRequire(import.meta.url);
  const { GetEnvInfo } = await import(pathToFileURL(require.resolve('@babylonjs/core/Misc/environmentTextureTools.js')).href);
  const info = GetEnvInfo(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  assert.ok(info, 'a valid .env header');
  assert.equal(info.width, ENV_CUBE_SIZE);
  assert.equal(info.imageType, 'image/png');
  const levels = Math.log2(ENV_CUBE_SIZE) + 1;
  assert.equal(info.specular.mipmaps.length, levels * 6, 'every mip level of every face is in the file');
  assert.ok(info.specular.mipmaps.every(mip => mip.length > 0 && mip.position >= 0));
  assert.ok(record.babylon.startsWith('8.'), 'baked by the Babylon major the page ships');
});
