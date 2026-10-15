import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import { createLoader } from './loadTs.mjs';

const { load } = createLoader();

test('each page has a solid ground-tier arch with an empty eye-height aperture and tunnel depth', async () => {
  const { createPageGates } = await load('features/arena/pageGates.ts');
  const { pageGateGeometry } = await load('features/arena/pageGateMeshes.ts');
  assert.ok(pageGateGeometry(createPageGates(40)[0], true).positions.length < pageGateGeometry(createPageGates(64)[0], false).positions.length,
    'phones use fewer arch faces');
  for (const phone of [false, true]) {
    const gates = createPageGates(phone ? 40 : 64);
    assert.equal(gates.length, 8);
    for (const gate of gates) {
      const data = pageGateGeometry(gate, phone);
      assert.ok(data.positions.length > 800, `${gate.id} has jamb, arch, reveal and readable sign geometry`);
      assert.equal(data.positions.length, data.normals.length);
      assert.equal(data.colors.length, data.positions.length / 3 * 4);
      assert.ok(data.positions.every(Number.isFinite));
      assert.ok(data.indices.every(index => index >= 0 && index < data.positions.length / 3));
      const tangent = [-gate.outward[2], 0, gate.outward[0]];
      const local = index => {
        const x = data.positions[index * 3] - gate.center[0];
        const y = data.positions[index * 3 + 1];
        const z = data.positions[index * 3 + 2] - gate.center[2];
        return [x * tangent[0] + z * tangent[2], y, x * gate.outward[0] + z * gate.outward[2]];
      };
      const points = Array.from({ length: data.positions.length / 3 }, (_, index) => local(index));
      assert.ok(Math.min(...points.map(p => p[2])) < -0.5, 'front rim projects toward the arena');
      assert.ok(Math.max(...points.map(p => p[2])) > 1.5, 'the reveal has physical tunnel depth');
      assert.ok(Math.max(...points.map(p => p[1])) <= gate.floorY + 4.25, 'ground tier stays below its cornice');
      assert.ok(points.every(([x, y]) => Math.abs(x) > 0.82 || y < gate.floorY + 0.2 || y > gate.center[1] + 0.8),
        'the camera crosses an empty passage rather than a plane');
      assert.ok(data.indices.length < 15000, 'letters and arch are baked into one bounded mesh');
    }
  }
});

test('real Babylon gates share the supplied scene and one material ready for warmup, fade without rebuilding, and dispose fully', async () => {
  const B = await load('shared/babylon/babylonCore.ts');
  const A = await load('features/arena/arenaCore.ts');
  const { createPageGateMeshes } = await load('features/arena/pageGateMeshes.ts');
  const engine = new NullEngine();
  try {
    const scene = new B.Scene(engine);
    const gates = createPageGateMeshes(B, A, scene, false);
    assert.equal(engine.scenes.length, 1);
    assert.equal(gates.meshes.length, 8);
    const materials = scene.materials.filter(material => material.name.startsWith('arenaPageGate'));
    assert.equal(materials.length, 1);
    assert.equal(materials[0].transparencyMode, B.Material.MATERIAL_ALPHABLEND, 'fade uses a fixed shader mode');
    assert.equal(materials[0].forceDepthWrite, true, 'near jambs occlude the distant arena');
    assert.equal(scene.textures.length, 0, 'baked labels allocate no runtime texture');
    assert.ok(gates.meshes.every(mesh => mesh.material === materials[0] && !mesh.isPickable));
    assert.ok(gates.meshes.every(mesh => mesh.getTotalVertices() > 200 && !mesh.isVisible));
    const { createPageGates } = await load('features/arena/pageGates.ts');
    for (const [index, gate] of createPageGates().entries()) {
      const eye = new B.Vector3(...gate.center), outward = new B.Vector3(...gate.outward);
      const ray = new Ray(eye.subtract(outward.scale(2)), outward, 4);
      assert.equal(ray.intersectsMesh(gates.meshes[index]).hit, false, 'real triangles leave the gate centre open');
      const jamb = eye.add(new B.Vector3(-gate.outward[2], 0, gate.outward[0]).scale(24 * Math.sin(gate.halfAngle) - 0.09));
      const jambRay = new Ray(jamb.subtract(outward.scale(2)), outward, 4);
      assert.equal(jambRay.intersectsMesh(gates.meshes[index]).hit, true, 'the adjacent steel jamb has real depth');
    }
    const vertexCounts = gates.meshes.map(mesh => mesh.getTotalVertices());
    gates.update(0.65, 'team');
    assert.ok(gates.meshes.every(mesh => mesh.isVisible && Math.abs(mesh.visibility - 0.65) < 1e-8));
    gates.update(1, 'about');
    assert.deepEqual(gates.meshes.map(mesh => mesh.getTotalVertices()), vertexCounts);
    gates.update(0);
    assert.ok(gates.meshes.every(mesh => !mesh.isVisible));
    gates.dispose(); gates.dispose();
    assert.equal(scene.meshes.length, 0);
    assert.equal(scene.materials.filter(material => material.name.startsWith('arenaPageGate')).length, 0);
    assert.equal(scene.textures.length, 0);
    scene.dispose();
  } finally { engine.dispose(); }
});
