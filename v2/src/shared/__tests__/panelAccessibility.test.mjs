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
const headingUrl = moduleUrl(withContext(source('../ui/SectionHeading.tsx'))
  .replace("from './Reveal'", `from '${revealUrl}'`).replace("from './Eyebrow'", `from '${eyebrowUrl}'`)
  .replace("from './DecodeText'", `from '${decodeUrl}'`));
const sectionUrl = moduleUrl(withContext(source('../components/SectionWrapper.tsx'))
  .replace("from '@/shared/ui/Reveal'", `from '${revealUrl}'`).replace("from '@/shared/ui/SectionHeading'", `from '${headingUrl}'`));
const { Reveal } = await import(revealUrl);
const { SectionHeading } = await import(headingUrl);
const { SectionWrapper } = await import(sectionUrl);
const { CountUp } = await import(moduleUrl(withContext(source('../ui/CountUp.tsx'))
  .replace("from '@/shared/motion/useMotionPreference'", `from '${preferenceUrl}'`)));
const orderUrl = moduleUrl(source('../dialogFocusOrder.ts'));
const { createDialogManager } = await import(moduleUrl(source('../hooks/useDialogFocus.ts')
  .replace("from '../dialogFocusOrder'", `from '${orderUrl}'`)
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
      timeline: transitionTimeline(mode, 'open'), enteredAt: performance.now() + 10000,
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

function focusFixture() {
  const saved = Object.fromEntries(['HTMLElement', 'MutationObserver', 'getComputedStyle'].map(name => [name, globalThis[name]]));
  const listeners = new Map();
  const doc = {
    activeElement: null, body: null,
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    removeEventListener: type => { listeners.delete(type); },
    emit: (type, event) => listeners.get(type)?.(event),
  };
  class Element {
    constructor(control = false) {
      this.children = []; this.parentElement = null; this.ownerDocument = doc;
      this.control = control; this.tabIndex = control ? 0 : -1; this.inert = false; this.isConnected = true;
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
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
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
  return { doc, opener, nav, dialog, first, last, restore, key };
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
