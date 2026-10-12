// Run with npm run test:unit. Transpile the shipped sizing function, not a copy.
// MUTATE_GRAIN_FULLSCREEN=1 restores viewport-sized buffers to prove the budget
// and viewport-independence assertions fail (red), then pass without it (green).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const ts = require('typescript');

async function loadGrainBuffers() {
  let src = readFileSync(new URL('../grainBuffers.ts', import.meta.url), 'utf8');
  if (process.env.MUTATE_GRAIN_FULLSCREEN === '1') {
    for (const [dimension, viewport] of [['width', '_viewportWidth'], ['height', '_viewportHeight']]) {
      const target = `const ${dimension} = TILE_SIZE;`;
      assert.ok(src.includes(target), 'mutation target not found');
      src = src.replace(target, `const ${dimension} = ${viewport};`);
    }
  }
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

test('1440 and 4K viewports allocate the same grain buffers', async () => {
  const { grainBufferLayout } = await loadGrainBuffers();
  assert.deepEqual(grainBufferLayout(3840, 2160), grainBufferLayout(1440, 900));
});

test('grain allocation stays within 3 MiB even on oversized viewports', async () => {
  const { grainBufferLayout } = await loadGrainBuffers();
  for (const [width, height] of [[1440, 900], [3840, 2160], [16384, 16384]]) {
    const layout = grainBufferLayout(width, height);
    assert.equal(layout.frameCount, 10);
    assert.equal(layout.bytes, layout.width * layout.height * layout.frameCount * 4);
    assert.ok(layout.bytes <= 3 * 1024 * 1024, `${width}x${height}: ${layout.bytes} bytes exceeds 3 MiB`);
  }
});
