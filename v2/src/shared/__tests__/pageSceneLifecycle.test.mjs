import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { createLoader } from './loadTs.mjs';

const { load } = createLoader();
const B = await load('shared/babylon/babylonCore.ts');
const { createPageSceneLifecycle } = await load('features/arena/pageSceneLifecycle.ts');
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return {promise,resolve,reject}; };

test('page availability waits for every compile and scene readiness; a rejected warmup retains fallback', async () => {
  const engine = new NullEngine(), scene = new B.Scene(engine), mesh = new B.Mesh('gate', scene);
  let ready = false, available = false, requests = 0, compile = deferred();
  // This boundary tests promise/lifecycle ordering, not GPU shader compilation.
  const material = new B.StandardMaterial('gateSteel', scene);
  material.forceCompilationAsync = () => compile.promise; mesh.material = material;
  const lifecycle = createPageSceneLifecycle(engine, [mesh], () => ready, value => { available=value; }, () => requests++);
  try {
    const warming = lifecycle.warm();
    assert.equal(available, false); compile.resolve(); assert.equal(await warming, true);
    assert.equal(available, false, 'compiled geometry alone cannot release an unready arena');
    ready = true; lifecycle.sceneReady(); assert.equal(available, true);
    compile = deferred(); const rejected = lifecycle.warm(); compile.reject(new Error('compile rejected'));
    assert.equal(await rejected, false); assert.equal(available, false);
    assert.ok(requests > 0);
  } finally { lifecycle.dispose(); scene.dispose(); engine.dispose(); }
});

test('actual engine loss/restoration events cancel stale warmups and disposal removes observers', async () => {
  const engine = new NullEngine(), scene = new B.Scene(engine), mesh = new B.Mesh('gate', scene);
  let available = false, compile = deferred();
  const material = new B.StandardMaterial('gateSteel', scene);
  material.forceCompilationAsync = () => compile.promise; mesh.material = material;
  const beforeLost = engine.onContextLostObservable.observers.length, beforeRestored = engine.onContextRestoredObservable.observers.length;
  const lifecycle = createPageSceneLifecycle(engine, [mesh], () => true, value => { available=value; }, () => {});
  try {
    const original = lifecycle.warm();
    engine.onContextLostObservable.notifyObservers(engine);
    compile.resolve(); assert.equal(await original, false); assert.equal(available, false);
    compile = deferred(); engine.onContextRestoredObservable.notifyObservers(engine);
    assert.equal(available, false); compile.resolve(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(available, true);
    compile = deferred(); const pending = lifecycle.warm(); lifecycle.dispose(); compile.resolve();
    assert.equal(await pending, false); assert.equal(available, false);
    assert.equal(engine.onContextLostObservable.observers.filter(observer => !observer._willBeUnregistered).length, beforeLost);
    assert.equal(engine.onContextRestoredObservable.observers.filter(observer => !observer._willBeUnregistered).length, beforeRestored);
  } finally { lifecycle.dispose(); scene.dispose(); engine.dispose(); }
});
