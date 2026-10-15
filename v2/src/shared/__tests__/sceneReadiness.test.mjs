// Run with npm run test:unit. The scene's readiness milestones (Phase 4 M1 added 'home': the first screen may
// take over from the age gate).
import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from './sourceModule.mjs';
import { sceneLoadingModuleUrls } from './sceneLoadingModuleUrls.mjs';

const urls = sceneLoadingModuleUrls(moduleUrl, source);
const { createSceneReadiness } = await import(urls.readiness);

test('readiness exposes module, scene, frame and home in order and resets only the canvas milestones', () => {
  const readiness = createSceneReadiness();
  const observed = [];
  const unsubscribe = readiness.subscribe(() => observed.push(readiness.getSnapshot()));
  readiness.mark('module'); readiness.mark('scene'); readiness.mark('module'); readiness.mark('frame'); readiness.mark('scene');
  assert.deepEqual(observed, ['module', 'scene', 'frame']);
  readiness.mark('home'); readiness.mark('frame');
  assert.deepEqual(observed, ['module', 'scene', 'frame', 'home'], 'a late, lower milestone never takes a milestone back');
  readiness.resetScene(); assert.equal(readiness.getSnapshot(), 'module', 'a remounted canvas needs its own frames');
  readiness.mark('scene'); readiness.mark('frame');
  unsubscribe(); readiness.resetScene(); assert.equal(observed.length, 7);
});

test('home can be reached straight from nothing: with no WebGL the age gate is released by the failure alone', () => {
  const readiness = createSceneReadiness();
  assert.equal(readiness.getSnapshot(), null);
  readiness.mark('home');
  assert.equal(readiness.getSnapshot(), 'home');
  readiness.mark('module');
  assert.equal(readiness.getSnapshot(), 'home');
});
