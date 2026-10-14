// A tiny hook runtime for testing a shipped component without a DOM or a renderer.
// It implements useState, useRef, useMemo, useCallback, useId and useEffect / useLayoutEffect
// (deps, cleanups, layout effects before passive ones, re-render until stable), plus a fake
// clock for window.setTimeout. The component's own JSX is real: `output` is the element tree it
// returns. Host refs are attached after each render, as React does before the layout effects.
//
//   const harness = createHarness(Component, { attach: (type, props) => fakeNode });
//   harness.mount(props); harness.act(() => click()); harness.output; harness.unmount();
//
// A test file maps the component's `from 'react'` import to harnessHooksUrl(moduleUrl).

const KEY = '__hookHarness';

/** A module that forwards React's hooks to the harness that is rendering right now. */
export function harnessHooksUrl(moduleUrl) {
  const names = ['useState', 'useRef', 'useMemo', 'useCallback', 'useId', 'useEffect', 'useLayoutEffect'];
  return moduleUrl(`
    ${names.map(name => `export const ${name} = (...args) => globalThis.${KEY}.${name}(...args);`).join('\n')}
    export const startTransition = callback => { (globalThis.__transitions ??= []).push(callback); callback(); };
  `);
}

export function createClock() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay) { const token = ++id; timers.set(token, { callback, at: now + Math.max(0, delay) }); return token; },
    clearTimeout(token) { timers.delete(token); },
    /** Runs every timer due within `ms`, in order, then moves the clock there. */
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
      }
      now = target;
    },
    get pending() { return [...timers.values()].map(timer => timer.at - now); },
    get now() { return now; },
  };
}

export function createHarness(component, { attach } = {}) {
  const slots = [];
  let cursor = 0;
  let dirty = false;
  let props = null;
  let output = null;
  let layoutQueue = [];
  let passiveQueue = [];

  const depsChanged = (previous, next) => previous === undefined || next === undefined || previous.length !== next.length
    || next.some((value, index) => !Object.is(value, previous[index]));

  const effectHook = layout => (effect, deps) => {
    const slot = slots[cursor] ??= { first: true, deps: undefined, cleanup: undefined };
    cursor += 1;
    if (!slot.first && !depsChanged(slot.deps, deps)) return;
    slot.first = false;
    slot.deps = deps;
    (layout ? layoutQueue : passiveQueue).push(() => {
      if (typeof slot.cleanup === 'function') slot.cleanup();
      slot.cleanup = effect();
    });
  };

  const hooks = {
    useState(initial) {
      const slot = slots[cursor] ??= { value: typeof initial === 'function' ? initial() : initial };
      cursor += 1;
      slot.set ??= next => {
        const value = typeof next === 'function' ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; }
      };
      return [slot.value, slot.set];
    },
    useRef(initial) {
      const slot = slots[cursor] ??= { current: initial };
      cursor += 1;
      return slot;
    },
    useMemo(factory, deps) {
      const slot = slots[cursor] ??= { deps: undefined, value: undefined, first: true };
      cursor += 1;
      if (slot.first || depsChanged(slot.deps, deps)) { slot.first = false; slot.deps = deps; slot.value = factory(); }
      return slot.value;
    },
    useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
    useId() {
      const slot = slots[cursor] ??= { id: `:h${cursor}:` };
      cursor += 1;
      return slot.id;
    },
    useLayoutEffect: effectHook(true),
    useEffect: effectHook(false),
  };

  function attachRefs(node) {
    if (!attach || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(attachRefs); return; }
    const element = node;
    if (typeof element.type === 'string' && element.props?.ref && typeof element.props.ref === 'object') {
      element.props.ref.current = attach(element.type, element.props);
    }
    attachRefs(element.props?.children);
  }

  function renderOnce() {
    cursor = 0;
    dirty = false;
    layoutQueue = [];
    passiveQueue = [];
    const previous = globalThis[KEY];
    globalThis[KEY] = hooks;
    try { output = component(props); } finally { globalThis[KEY] = previous; }
    attachRefs(output);
    layoutQueue.forEach(run => run());
    passiveQueue.forEach(run => run());
  }

  function flush() {
    for (let pass = 0; pass < 50; pass++) {
      renderOnce();
      if (!dirty) return;
    }
    throw new Error('the component re-rendered 50 times without settling');
  }

  const harness = {
    mount(nextProps) { props = nextProps; flush(); },
    update(nextProps) { props = nextProps; flush(); },
    /** Runs `action` (an event handler or a timer advance), then renders what it queued. */
    act(action) {
      const previous = globalThis[KEY];
      globalThis[KEY] = hooks;
      try { action(); } finally { globalThis[KEY] = previous; }
      flush();
    },
    unmount() {
      for (const slot of slots) if (slot && typeof slot.cleanup === 'function') { slot.cleanup(); slot.cleanup = undefined; }
    },
    get output() { return output; },
  };
  return harness;
}

/** Every element in a tree for which `predicate(element)` holds, depth first. */
export function findAll(node, predicate, found = []) {
  if (node === null || node === undefined || typeof node !== 'object') return found;
  if (Array.isArray(node)) { node.forEach(child => findAll(child, predicate, found)); return found; }
  if (predicate(node)) found.push(node);
  findAll(node.props?.children, predicate, found);
  return found;
}

export function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.props?.children);
}
