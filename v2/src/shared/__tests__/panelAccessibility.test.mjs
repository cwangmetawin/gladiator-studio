// No browser: exercise the real focus manager and server-render the shipped TSX.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

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
const React = await import(pathToFileURL(require.resolve('react')).href);
const { renderToStaticMarkup } = await import(pathToFileURL(require.resolve('react-dom/server')).href);
const tokensUrl = moduleUrl(source('../motion/tokens.ts'));
const preferenceUrl = moduleUrl(source('../motion/useMotionPreference.ts'));
const { motionPreference } = await import(preferenceUrl);
const contextUrl = moduleUrl(source('../motion/panelMotion.ts'));
const { PanelMotionContext } = await import(contextUrl);
const { transitionTimeline } = await import(tokensUrl);
const withContext = src => src.replace("from '@/shared/motion/panelMotion'", `from '${contextUrl}'`);
const revealUrl = moduleUrl(withContext(source('../ui/Reveal.tsx')).replace("from '@/shared/motion/tokens'", `from '${tokensUrl}'`)
  .replace("from '@/shared/motion/useMotionPreference'", `from '${preferenceUrl}'`));
const eyebrowUrl = moduleUrl(source('../ui/Eyebrow.tsx'));
const decodeUrl = moduleUrl(source('../ui/DecodeText.tsx'));
const titleMotionUrl = moduleUrl(source('../motion/titleMotion.ts').replace("from './tokens'", `from '${tokensUrl}'`));
const panelTitleUrl = moduleUrl(withContext(source('../ui/PanelTitle.tsx'))
  .replace("from '@/shared/motion/titleMotion'", `from '${titleMotionUrl}'`)
  .replace("from '@/shared/motion/tokens'", `from '${tokensUrl}'`)
  .replace("from '@/shared/motion/useMotionPreference'", `from '${preferenceUrl}'`));
const headingUrl = moduleUrl(withContext(source('../ui/SectionHeading.tsx'))
  .replace("from './Reveal'", `from '${revealUrl}'`).replace("from './Eyebrow'", `from '${eyebrowUrl}'`)
  .replace("from './PanelTitle'", `from '${panelTitleUrl}'`)
  .replace("from './DecodeText'", `from '${decodeUrl}'`));
const sectionUrl = moduleUrl(withContext(source('../components/SectionWrapper.tsx'))
  .replace("from '@/shared/ui/Reveal'", `from '${revealUrl}'`).replace("from '@/shared/ui/SectionHeading'", `from '${headingUrl}'`));
const { Reveal } = await import(revealUrl);
const { SectionHeading } = await import(headingUrl);
const { SectionWrapper } = await import(sectionUrl);
const { CountUp } = await import(moduleUrl(withContext(source('../ui/CountUp.tsx'))
  .replace("from '@/shared/motion/useMotionPreference'", `from '${preferenceUrl}'`)));
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

for (const mode of ['desktop', 'phone', 'reduced']) {
  test(`${mode} panel content is fully visible without viewport observation or delayed decrypt glyphs`, () => {
    const html = renderToStaticMarkup(React.createElement(PanelMotionContext.Provider, { value: {
      mode, timeline: transitionTimeline(mode, 'open'), enteredAt: performance.now() + (mode === 'reduced' ? -10000 : 10000),
      settled: mode !== 'reduced', instantContent: mode !== 'desktop',
    } }, React.createElement(SectionWrapper, { id: 'example' },
      React.createElement(SectionHeading, { as: 'h1', eyebrow: 'Example', title: 'Readable title', lede: 'Readable lede' }),
      React.createElement(Reveal, { delay: 30 }, React.createElement('p', null, 'Readable body')),
      React.createElement('p', null, 'Unwrapped body'),
      React.createElement(CountUp, { to: 97, prefix: 'RTP ', suffix: '%' }))));
    for (const text of ['Readable title', 'Readable lede', 'Readable body', 'Unwrapped body', 'RTP 97%']) assert.ok(html.includes(text));
    assert.doesNotMatch(html, /opacity:0(?:;|")/);
    assert.doesNotMatch(html, /inert="/);
    assert.doesNotMatch(html, /decode-glyph/);
  });
}

for (const mode of ['desktop', 'phone', 'reduced']) {
  test(`${mode} title reveal renders one intact heading and uses no layout animation`, () => {
    const html = renderToStaticMarkup(React.createElement(PanelMotionContext.Provider, { value: {
      mode, timeline: transitionTimeline(mode, 'open'), enteredAt: performance.now() + 10000,
      settled: false, instantContent: mode !== 'desktop',
    } }, React.createElement(SectionHeading, { title: 'One readable title' })));
    assert.equal(html.split('One readable title').length - 1, 1);
    assert.equal(html.match(/<h2\b/g)?.length, 1);
    assert.ok(html.includes('data-title-reveal='));
    if (mode === 'reduced') {
      assert.match(html, /style="opacity:0"/);
      assert.doesNotMatch(html, /transform:|clip-path:|mask:/);
    } else {
      assert.match(html, /clip-path:inset\(-12% -6% 112% -6%\)/);
      assert.match(html, /transform:translateY\(8px\)/);
    }
    assert.doesNotMatch(html, /style="[^"\n]*(?:letter-spacing|font-size|width|height|padding|margin):/);
  });
}

function focusFixture() {
  const saved = Object.fromEntries(['HTMLElement', 'MutationObserver', 'getComputedStyle'].map(name => [name, globalThis[name]]));
  const listeners = new Map();
  const doc = {
    activeElement: null, body: null,
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    removeEventListener: type => { listeners.delete(type); },
    emit: (type, event) => listeners.get(type)?.(event),
  };
  // Like the browser's, the observer queues an inert attribute record for every write.
  let observer = null;
  class Element {
    constructor(control = false) {
      this.children = []; this.parentElement = null; this.ownerDocument = doc;
      this.control = control; this.tabIndex = control ? 0 : -1; this.inert = false; this.isConnected = true;
    }
    get inert() { return this.inertValue; }
    set inert(value) {
      this.inertValue = value;
      if (observer?.active) observer.pending.push({ type: 'attributes', target: this, attributeName: 'inert' });
    }
    append(child) { this.children.push(child); child.parentElement = this; return child; }
    contains(child) { return child === this || this.children.some(node => node.contains(child)); }
    querySelectorAll() { return this.children.flatMap(child => [...(child.control ? [child] : []), ...child.querySelectorAll()]); }
    closest() { for (let node = this; node; node = node.parentElement) if (node.inert) return node; return null; }
    matches() { return false; }
    hasAttribute() { return false; }
    getClientRects() { return [{}]; }
    focus() { doc.activeElement = this; doc.emit('focusin', {}); }
  }
  globalThis.HTMLElement = Element;
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; this.pending = []; this.active = false; observer = this; }
    observe() { this.active = true; }
    disconnect() { this.active = false; this.pending = []; }
    takeRecords() { const records = this.pending; this.pending = []; return records; }
  };
  // Delivers the queued records with one child-list change, as a mounting component would.
  const childListChange = () => {
    if (!observer?.active) return;
    observer.pending.push({ type: 'childList', target: doc.body });
    observer.callback(observer.takeRecords());
  };
  globalThis.getComputedStyle = () => ({ visibility: 'visible' });
  doc.body = new Element();
  const shell = doc.body.append(new Element());
  const opener = shell.append(new Element(true));
  const nav = shell.append(new Element(true));
  const dialog = shell.append(new Element());
  const first = dialog.append(new Element(true));
  const last = dialog.append(new Element(true));
  const restore = () => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
  };
  const key = (name, backward = false) => {
    const event = { key: name, shiftKey: backward, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    doc.emit('keydown', event);
    return event;
  };
  return { doc, opener, nav, dialog, first, last, restore, key, childListChange };
}

test('desktop side panels focus their content, leave bottom navigation reachable, handle Escape and restore the opener', () => {
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

test('phone panels retain modal isolation, focus containment, wrapping Tab and restoration', () => {
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
