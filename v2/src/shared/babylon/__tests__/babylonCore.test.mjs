// This checks real Babylon registrations without a browser. NullEngine does not
// validate GPU rendering or visual parity; those remain controller browser gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const ts = require('typescript');

async function loadCore() {
  const src = readFileSync(new URL('../babylonCore.ts', import.meta.url), 'utf8')
    .replace(/'(@babylonjs\/core\/[^']+)'/g, (_, specifier) => `'${pathToFileURL(require.resolve(specifier)).href}'`);
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

test('the lazy Babylon entry registers builders, layers, particles, picking and texture rescaling', async () => {
  const B = await loadCore();
  const { NullEngine } = await import(pathToFileURL(require.resolve('@babylonjs/core/Engines/nullEngine.js')).href);
  const engine = new NullEngine();
  const scene = new B.Scene(engine);
  try {
    new B.ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2, 9, B.Vector3.Zero(), scene);
    const material = new B.StandardMaterial('earth', scene);
    material.emissiveFresnelParameters = new B.FresnelParameters();
    for (const [name, builder] of Object.entries(B.MeshBuilder)) {
      const mesh = builder(name, {}, scene);
      mesh.material = material;
      assert.ok(mesh.getTotalVertices() > 0, `${name} must create geometry`);
    }
    const glow = new B.GlowLayer('glow', scene);
    const layer = new B.Layer('nebula', null, scene, true);
    const particles = new B.ParticleSystem('burst', 80, scene);
    particles.start();
    assert.ok(scene.effectLayers.includes(glow), 'glow must join the scene render stages');
    assert.ok(scene.layers.includes(layer), 'background layer must join the scene render stages');
    assert.ok(scene.particleSystems.includes(particles), 'particles must join the scene');
    assert.equal(typeof engine.createEffectForParticles, 'function');
    assert.equal(typeof B.Engine.prototype.createDynamicTexture, 'function');
    assert.equal(typeof B.Engine._RescalePostProcessFactory, 'function');
    assert.ok(scene.pick(128, 128), 'scene pointer handlers must have the Ray extension');
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
