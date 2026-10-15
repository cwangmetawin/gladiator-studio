import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const ts = require('typescript');
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
let nextRuntimeId = 0;

// A small offline hook driver lets a delayed SELECT race the real submit handler.
// Assertions inspect only primitive props/counts, never the element descriptions.
async function setup({ delayedWrite = false } = {}) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let inserts = 0;
  let reads = 0;
  let finishRead;
  let finishWrite;
  const read = new Promise((resolve) => { finishRead = resolve; });
  const write = new Promise((resolve) => { finishWrite = resolve; });
  const row = { id: 'doc-1', title: 'New integration', body: '', sort: 0, updated_at: '2026-10-15T12:00:00Z' };
  const noop = () => {};
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useId() { return 'doc-test'; },
    useEffect(run, deps) {
      const index = cursor++;
      if (!same(slots[index], deps)) { slots[index] = deps; effects.push(run); }
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { callback, deps };
      return slots[index].callback;
    },
  };
  const supabase = { from() { return {
    select() { reads++; const query = { order() { return query; }, then(resolve, reject) { return read.then(resolve, reject); } }; return query; },
    insert() { inserts++; return { select() { return { single: async () => delayedWrite ? write : ({ data: row, error: null }) }; } }; },
  }; } };
  const runtime = { hooks, supabase, noop };
  globalThis.__partnerDocsLoadingTest = runtime;
  let source = readFileSync(new URL('../PartnerDocsEditor.tsx', import.meta.url), 'utf8');
  if (process.env.MUTATE_DOC_LOADING === '1') {
    assert.ok(source.includes('if (loading || inFlight.current) return;'), 'loading guard mutation target exists');
    source = source.replace('if (loading || inFlight.current) return;', 'if (inFlight.current) return;');
  }
  if (process.env.MUTATE_DOC_RETRY === '1') {
    assert.ok(source.includes('if (inFlight.current) return;'), 'retry guard mutation target exists');
    source = source.replace('if (inFlight.current) return;', '');
  }
  source = source
    .replace(/^import .* from 'react';$/m, 'const { useCallback, useEffect, useId, useRef, useState } = runtime.hooks;')
    .replace(/^import .* from 'lucide-react';$/m, 'const FileText = runtime.noop, Plus = runtime.noop, Trash2 = runtime.noop;')
    .replace(/^import .* from '@\/lib\/supabase';$/m, 'const { supabase } = runtime;')
    .replace(/^import .* from '\.\/ConfirmDialog';$/m, 'const ConfirmDialog = runtime.noop;')
    .replace(/^import .* from '\.\/Toast';$/m, 'const useToast = () => ({ toast: runtime.noop });')
    .replace(/^import .* from '\.\/Unsaved';$/m, 'const useUnsaved = () => ({ setDirty: runtime.noop });')
    .replace(/^import .* from '\.\/partnerDocForm';$/m, readFileSync(new URL('../partnerDocForm.ts', import.meta.url), 'utf8'));
  source = `// Isolated harness ${nextRuntimeId++}\nconst runtime = globalThis.__partnerDocsLoadingTest; const h = (type, props, ...children) => ({ type, props: { ...props, children } });\n${source}`;
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, jsxFactory: 'h' } }).outputText;
  const { PartnerDocsEditor } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  delete globalThis.__partnerDocsLoadingTest;
  return {
    render() { cursor = 0; const tree = PartnerDocsEditor(); const pending = effects; effects = []; pending.forEach((run) => run()); return tree; },
    finishRead: (error = null) => finishRead({ data: [], error }),
    finishWrite: () => finishWrite({ data: row, error: null }),
    get inserts() { return inserts; },
    get reads() { return reads; },
  };
}
function find(tree, match) {
  if (!tree || typeof tree !== 'object') return null;
  if (Array.isArray(tree)) { for (const item of tree) { const found = find(item, match); if (found) return found; } return null; }
  return match(tree) ? tree : find(tree.props?.children, match);
}

test('documents cannot save ahead of a delayed initial list read, then save after it completes', async () => {
  const driver = await setup();
  let tree = driver.render();
  assert.equal(find(tree, (element) => element.type === 'fieldset').props.disabled, true);
  find(tree, (element) => element.type === 'input' && element.props.id.endsWith('-title')).props.onChange({ target: { value: 'New integration' } });
  tree = driver.render();
  await find(tree, (element) => element.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(driver.inserts, 0, 'pending list read blocks the write handler itself');
  driver.finishRead();
  await new Promise((resolve) => setImmediate(resolve));
  tree = driver.render();
  assert.equal(find(tree, (element) => element.type === 'fieldset').props.disabled, false);
  await find(tree, (element) => element.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(driver.inserts, 1, 'save is available when the initial list is complete');
  tree = driver.render();
  assert.equal(find(tree, (element) => element.type === 'button' && element.props['aria-current'] === 'true') !== null, true, 'saved document stays selected in the final list');
});

test('a failed list read cannot retry while a document save is pending', async () => {
  const driver = await setup({ delayedWrite: true });
  driver.render();
  driver.finishRead({ message: 'List temporarily unavailable' });
  await new Promise((resolve) => setImmediate(resolve));
  let tree = driver.render();
  const retry = (element) => element.type === 'button' && element.props.children.includes('Retry');
  assert.equal(Boolean(find(tree, retry).props.disabled), false);
  find(tree, (element) => element.type === 'input' && element.props.id.endsWith('-title')).props.onChange({ target: { value: 'New integration' } });
  tree = driver.render();
  const saving = find(tree, (element) => element.type === 'form').props.onSubmit({ preventDefault() {} });
  tree = driver.render();
  assert.equal(find(tree, retry).props.disabled, true, 'retry button is disabled during the save');
  find(tree, retry).props.onClick();
  assert.equal(driver.reads, 1, 'retry handler cannot start a read during the save');
  driver.finishWrite();
  await saving;
  tree = driver.render();
  assert.equal(find(tree, (element) => element.type === 'button' && element.props['aria-current'] === 'true') !== null, true, 'saved document remains in the list');
});
