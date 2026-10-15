// Browser boundary for the real modal manager; no focus behaviour is stubbed.
export function focusFixture() {
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

