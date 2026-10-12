import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
let src = readFileSync(new URL('../dialogFocusOrder.ts', import.meta.url), 'utf8');
if (process.env.MUTATE_DIALOG_WRAP === '1') {
  const wrap = '(currentIndex + (backward ? count - 1 : 1)) % count';
  assert.ok(src.includes(wrap), 'mutation target not found');
  src = src.replace(wrap, 'currentIndex + (backward ? -1 : 1)');
}
const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { nextDialogFocusIndex } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('Tab wraps from the last control to the first', () => {
  assert.equal(nextDialogFocusIndex(2, 3), 0);
});

test('Shift+Tab wraps from the first control to the last', () => {
  assert.equal(nextDialogFocusIndex(0, 3, true), 2);
});

test('focus outside the current list enters at the appropriate end', () => {
  assert.equal(nextDialogFocusIndex(-1, 3), 0);
  assert.equal(nextDialogFocusIndex(-1, 3, true), 2);
  assert.equal(nextDialogFocusIndex(5, 2), 0);
});

test('an empty dialog focuses its container and a single control cycles to itself', () => {
  assert.equal(nextDialogFocusIndex(-1, 0), -1);
  assert.equal(nextDialogFocusIndex(0, 1), 0);
  assert.equal(nextDialogFocusIndex(0, 1, true), 0);
});

test('twenty forward and backward steps remain within a changing focus list', () => {
  for (const count of [1, 2, 7]) {
    for (const backward of [false, true]) {
      let index = -1;
      for (let i = 0; i < 20; i++) {
        index = nextDialogFocusIndex(index, count, backward);
        assert.ok(index >= 0 && index < count);
      }
    }
  }
});
