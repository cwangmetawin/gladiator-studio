// Transpile the real decision function; MUTATE_EMPTY_FALLBACK=1 restores the old bug.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
let src = readFileSync(new URL('../catalogueRead.ts', import.meta.url), 'utf8');
if (process.env.MUTATE_EMPTY_FALLBACK === '1') {
  const guard = 'readFailed ? null : rows ?? []';
  assert.ok(src.includes(guard), 'mutation target not found');
  src = src.replace(guard, 'readFailed || !rows?.length ? null : rows');
}
const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { selectCatalogueRows } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('a successful empty published read stays empty instead of requesting fallback', () => {
  assert.deepEqual(selectCatalogueRows([], false), []);
});

test('a successful read preserves the published rows', () => {
  const rows = [{ id: 1, title: 'Published title' }];
  assert.equal(selectCatalogueRows(rows, false), rows);
});

test('a successful read without a data payload is also empty', () => {
  assert.deepEqual(selectCatalogueRows(null, false), []);
});

test('a failed read requests fallback even if a payload is present', () => {
  assert.equal(selectCatalogueRows([{ id: 1 }], true), null);
});

test('an unavailable database or failed empty read requests fallback', () => {
  assert.equal(selectCatalogueRows(null, true), null);
  assert.equal(selectCatalogueRows([], true), null);
});
