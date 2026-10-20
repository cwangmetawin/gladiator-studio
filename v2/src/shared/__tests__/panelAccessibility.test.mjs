// No browser: exercise the real focus manager with a document boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { focusFixture } from './dialogFixture.mjs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const moduleUrl = src => {
  const js = ts.transpileModule(src, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText.replace(/from ['"](react(?:\/jsx-runtime)?|framer-motion)['"]/g,
    (_match, name) => `from '${pathToFileURL(require.resolve(name)).href}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
};
const preferenceUrl = moduleUrl(source('../motion/useMotionPreference.ts'));
const { motionPreference } = await import(preferenceUrl);
const orderUrl = moduleUrl(source('../dialogFocusOrder.ts'));
const inertUrl = moduleUrl(source('../dialogInert.ts'));
const { createDialogManager } = await import(moduleUrl(source('../hooks/useDialogFocus.ts')
  .replace("from '../dialogFocusOrder'", `from '${orderUrl}'`)
  .replace("from '../dialogInert'", `from '${inertUrl}'`)
  .replace('function createDialogManager(', 'export function createDialogManager(')));

test('reduced-motion preference changes publish live snapshots and unsubscribe cleanly', () => {
  const previousWindow = globalThis.window;
  const listeners = new Set();
  const query = { matches: false, addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener) };
  globalThis.window = { matchMedia: () => query };
  try {
    let notifications = 0;
    const dispose = motionPreference.subscribe(() => { notifications++; });
    assert.equal(motionPreference.getSnapshot(), false);
    query.matches = true;
    listeners.forEach(listener => listener());
    assert.equal(motionPreference.getSnapshot(), true);
    query.matches = false;
    listeners.forEach(listener => listener());
    assert.equal(motionPreference.getSnapshot(), false);
    assert.equal(notifications, 2);
    dispose();
    assert.equal(listeners.size, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});

test('non-modal dialog manager focuses content, handles Escape and restores the opener', () => {
  const f = focusFixture();
  try {
    let closes = 0;
    const manager = createDialogManager(f.doc);
    const dispose = manager.attach({ dialog: f.dialog, scope: f.dialog, modal: false, returnTo: f.opener,
      initialFocus: () => f.first, onEscape: () => { closes++; } });
    assert.equal(f.doc.activeElement, f.first);
    assert.equal(f.nav.inert, false);
    assert.equal(f.key('Tab').defaultPrevented, false);
    f.nav.focus();
    assert.equal(f.doc.activeElement, f.nav);
    assert.equal(f.key('Escape').defaultPrevented, true);
    assert.equal(closes, 1);
    dispose();
    assert.equal(f.doc.activeElement, f.opener);
  } finally { f.restore(); }
});

test('a sibling React re-enables while a modal dialog is open is interactive once it closes', () => {
  // Production: the doors are inert while the catalogue opens, React re-enables them as it
  // closes, a mounting ticker re-runs the isolation, and the close must not restore true.
  const f = focusFixture();
  try {
    const manager = createDialogManager(f.doc);
    f.nav.inert = true;
    const dispose = manager.attach({ dialog: f.dialog, scope: f.dialog, modal: true, returnTo: f.opener,
      initialFocus: () => f.first, onEscape: () => {} });
    assert.equal(f.nav.inert, true);
    f.nav.inert = false;
    f.childListChange();
    assert.equal(f.nav.inert, true, 'the open dialog still isolates its siblings');
    dispose();
    assert.equal(f.nav.inert, false, "React's latest value wins when the dialog closes");
  } finally { f.restore(); }
});

test('arena dialogs retain modal isolation, focus containment, wrapping Tab and restoration', () => {
  const f = focusFixture();
  try {
    const manager = createDialogManager(f.doc);
    const dispose = manager.attach({ dialog: f.dialog, scope: f.dialog, modal: true, returnTo: f.opener,
      initialFocus: () => f.first, onEscape: () => {} });
    assert.equal(f.nav.inert, true);
    assert.equal(f.doc.activeElement, f.first);
    assert.equal(f.key('Tab').defaultPrevented, true);
    assert.equal(f.doc.activeElement, f.last);
    f.key('Tab');
    assert.equal(f.doc.activeElement, f.first);
    f.key('Tab', true);
    assert.equal(f.doc.activeElement, f.last);
    f.nav.focus();
    assert.equal(f.doc.activeElement, f.first);
    dispose();
    assert.equal(f.nav.inert, false);
    assert.equal(f.doc.activeElement, f.opener);
  } finally { f.restore(); }
});

test('Client Area above the phone drawer traps focus, consumes Escape and returns to its original drawer button', () => {
  const f = focusFixture();
  try {
    const manager = createDialogManager(f.doc);
    const closeDrawer = manager.attach({ dialog: f.dialog, scope: f.dialog, modal: true, returnTo: f.opener,
      initialFocus: () => f.first, onEscape() {} });
    const client = f.dialog.parentElement.append(new HTMLElement());
    const close = client.append(new HTMLElement(true)), access = client.append(new HTMLElement(true));
    let closes = 0;
    const closeClient = manager.attach({ dialog: client, scope: client, modal: true, returnTo: f.first,
      initialFocus: () => close, onEscape: () => { closes++; closeClient(); } });
    assert.equal(f.dialog.inert, true);
    assert.equal(f.doc.activeElement === close, true);
    f.key('Tab', true);
    assert.equal(f.doc.activeElement === access, true);
    f.key('Tab');
    assert.equal(f.doc.activeElement === close, true);
    f.nav.focus();
    assert.equal(f.doc.activeElement === close, true, 'the page underneath cannot take focus');
    assert.equal(f.key('Escape').defaultPrevented, true);
    assert.equal(closes, 1);
    assert.equal(f.dialog.inert, false);
    assert.equal(f.doc.activeElement === f.first, true, 'the same drawer trigger receives focus');
    closeDrawer();
    assert.equal(f.doc.activeElement === f.opener, true, 'closing the drawer still returns to Menu');
  } finally { f.restore(); }
});

test('a dialog mounted together with one inside it stays underneath, as React runs the inner effects first', () => {
  const f = focusFixture();
  try {
    const manager = createDialogManager(f.doc);
    const inner = f.dialog.append(new HTMLElement());
    const innerClose = inner.append(new HTMLElement(true)), innerOk = inner.append(new HTMLElement(true));
    let innerCloses = 0, outerCloses = 0;
    // The inner layout effect attaches first; the outer one sees focus inside itself and keeps no opener.
    const closeInner = manager.attach({ dialog: inner, scope: inner, modal: true, returnTo: f.opener,
      initialFocus: () => innerOk, onEscape: () => { innerCloses++; } });
    const closeOuter = manager.attach({ dialog: f.dialog, scope: f.dialog, modal: true, returnTo: null,
      initialFocus: () => f.first, onEscape: () => { outerCloses++; } });
    assert.equal(f.doc.activeElement === innerOk, true, 'the outer dialog does not take focus from the inner one');
    assert.equal(f.first.inert, true, 'the outer dialog\'s own controls sit behind the inner one');
    assert.equal(f.nav.inert, true);
    f.key('Tab');
    assert.equal(f.doc.activeElement === innerClose, true);
    f.key('Tab');
    assert.equal(f.doc.activeElement === innerOk, true, 'Tab stays inside the inner dialog');
    f.key('Escape');
    assert.deepEqual([innerCloses, outerCloses], [1, 0], 'Escape closes the inner dialog first');
    closeInner();
    assert.equal(f.first.inert, false);
    assert.equal(f.doc.activeElement === f.first, true, 'the outer dialog takes focus once the inner one closes');
    closeOuter();
    assert.equal(f.nav.inert, false);
    assert.equal(f.doc.activeElement === f.opener, true, 'closing the outer dialog returns to the original opener');
  } finally { f.restore(); }
});
