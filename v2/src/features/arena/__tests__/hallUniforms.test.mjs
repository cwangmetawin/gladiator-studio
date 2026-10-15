// Run with npm run test:unit. Every value the hall hands its shaders matches the GLSL type it declares.
// Why (Phase 4 M3 review): the card size went in through setFloats, which Babylon uploads with
// uniform1fv. WebGL rejects that for a vec2 (INVALID_OPERATION, only a console warning), so uSize
// stayed 0, every card's uv collapsed to one texel and the covers drew as flat beige slabs.
// NullEngine uploads nothing, so this checks the setter Babylon will use against the declaration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const B = await load('shared/babylon/babylonCore.ts'), A = await load('features/arena/arenaCore.ts');
const { createHallScene } = await load('features/arena/hallScene.ts');
const { hallContent, hallDrawn } = await load('features/arena/hallState.ts');
const { coverForGame } = await load('features/arena/hallManifest.ts');

// Which ShaderMaterial store Babylon uploads each value from, and the GLSL types that upload fits.
const STORES = {
  _floats: ['float'], _floatsArrays: ['float'], _ints: ['int'], _vectors2: ['vec2'], _vectors3: ['vec3'],
  _colors3: ['vec3'], _vectors4: ['vec4'], _colors4: ['vec4'], _matrices: ['mat4'], _textures: ['sampler2D'],
};

function declarations(source) {
  const types = new Map();
  for (const [, type, names] of source.matchAll(/uniform\s+(\w+)\s+([^;]+);/g)) {
    for (const name of names.split(',')) types.set(name.trim(), type);
  }
  return types;
}

test('every hall uniform is set through a setter of its declared GLSL type', () => {
  const engine = new NullEngine({ renderWidth: 1440, renderHeight: 900 }), scene = new B.Scene(engine);
  const camera = new A.FreeCamera('arenaCamera', new B.Vector3(0, 2.8, 16.9), scene);
  camera.fov = 0.82;
  const texture = () => A.RawTexture.CreateRGBATexture(new Uint8Array([100, 140, 180, 255]), 1, 1, scene, false, false);
  const items = Array.from({ length: 6 }, (_, i) => {
    const game = { id: i, title: `Game ${i}`, category: 'slot', image: `/cover-${i}.jpg`, timeline: '', link: 'https://example.com' };
    return { game, cover: coverForGame(game, null, false) };
  });
  try {
    const hall = createHallScene(B, A, scene, items, false, () => {}, texture);
    hall.step({ offset: 0.3, fade: 1, dt: 0, time: 1, reduced: false });
    const materials = scene.materials.filter(material => material.name.startsWith('hall'));
    assert.ok(materials.length > 0);
    let checked = 0;
    for (const material of materials) {
      const { vertex, fragment } = material._shaderPath;
      const types = declarations(`${B.Effect.ShadersStore[`${vertex}VertexShader`]}\n${B.Effect.ShadersStore[`${fragment}FragmentShader`]}`);
      for (const [store, allowed] of Object.entries(STORES)) {
        for (const name of Object.keys(material[store] ?? {})) {
          const declared = types.get(name);
          assert.ok(declared, `${material.name} sets ${name}, which its shaders never declare`);
          assert.ok(allowed.includes(declared), `${material.name}.${name} is a ${declared} but is uploaded from ${store}`);
          checked++;
        }
      }
    }
    assert.ok(checked > materials.length, 'the check saw the per-card uniforms');
    hall.dispose();
  } finally { scene.dispose(); engine.dispose(); hallContent.publish([]); hallDrawn.publish(false); }
});
