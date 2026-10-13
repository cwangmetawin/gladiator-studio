// Run with npm run test:unit. The modal dialog's inert bookkeeping must not override React.
// MUTATE_INERT_LEDGER=1 ignores external writes, the bug that left the constellation doors
// inert after the catalogue closed (red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
let src = readFileSync(new URL('../dialogInert.ts', import.meta.url), 'utf8');
if (process.env.MUTATE_INERT_LEDGER === '1') {
  const target = 'if (held.has(node)) held.set(node, node.inert);';
  assert.ok(src.includes(target), 'inert-ledger mutation target not found');
  src = src.replace(target, '');
}
const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { createInertLedger } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('a sibling gets back the inert it had before the dialog', () => {
  const ledger = createInertLedger();
  const open = { inert: false };
  const closed = { inert: true };
  ledger.hold(open); ledger.hold(closed);
  assert.equal(open.inert, true); assert.equal(closed.inert, true);
  ledger.releaseAll();
  assert.equal(open.inert, false); assert.equal(closed.inert, true);
});

test('React re-enabling the doors while the catalogue is open wins on close (production sequence)', () => {
  const ledger = createInertLedger();
  const doors = { inert: true };           // a panel is opening: React sets inert={!active}
  ledger.hold(doors);                       // the catalogue opens and snapshots true
  doors.inert = false;                      // the panel closes: React removes inert
  ledger.noteExternal(doors);               // the MutationObserver reports React's write
  ledger.releaseAll(); ledger.hold(doors);  // a later DOM change re-runs the isolation
  assert.equal(doors.inert, true, 'the dialog still isolates while it is open');
  ledger.releaseAll();                      // the catalogue unmounts
  assert.equal(doors.inert, false, 'the doors must be interactive again');
});

test('an external write to a node the dialog does not hold is ignored', () => {
  const ledger = createInertLedger();
  const other = { inert: false };
  ledger.noteExternal(other);
  other.inert = true;
  ledger.releaseAll();
  assert.equal(other.inert, true);
});
