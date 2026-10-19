import { useLayoutEffect, useRef, type RefObject } from 'react';
import { nextDialogFocusIndex } from '../dialogFocusOrder';
import { createInertLedger } from '../dialogInert';

interface DialogOptions {
  readonly active?: boolean;
  /** Side panels move focus without isolating the desktop command bar. */
  readonly modal?: boolean;
  readonly onEscape?: () => void;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /** Capture an opener before a lazy dialog or its background transition starts. */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  /** Includes a separate backdrop without making that backdrop inert. */
  readonly isolationRef?: RefObject<HTMLElement | null>;
}

interface DialogEntry {
  readonly dialog: HTMLElement;
  readonly modal: boolean;
  readonly scope: HTMLElement;
  readonly returnTo: HTMLElement | null;
  readonly initialFocus: () => HTMLElement | null;
  readonly onEscape: () => void;
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    // iframe: a keyboard player must be able to Tab into the game; the sentinels around it
    // bring focus back to the host controls when the game's own tab order ends.
    'a[href], button, iframe, input, select, textarea, [contenteditable="true"], [tabindex]',
  )).filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.hasAttribute('data-focus-guard')
    && !el.closest('[inert], [hidden], [aria-hidden="true"]')
    && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
    .sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity));
}

function focusInitial(entry: DialogEntry): void {
  const initial = entry.initialFocus();
  const controls = focusableElements(entry.dialog);
  const target = initial && controls.includes(initial) ? initial : controls[0] ?? entry.dialog;
  target.focus({ preventScroll: true });
}

// One manager per document: nested dialogs share one listener and one inert snapshot.
// Recomputing from the top layer also supports portals and out-of-order unmounts.
function createDialogManager(doc: Document) {
  let entries: readonly DialogEntry[] = [];
  const inertNodes = createInertLedger<HTMLElement>();
  const top = () => entries.at(-1);

  // Pending inert records are someone else's writes (React's inert prop): ours are dropped
  // right after we make them. Without this, closing the catalogue restored the door layer's
  // stale inert and left every constellation door dead.
  function noteExternalWrites(records: readonly MutationRecord[]) {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof HTMLElement) inertNodes.noteExternal(record.target);
    }
  }

  function updateInert() {
    noteExternalWrites(observer.takeRecords());
    inertNodes.releaseAll();
    const entry = top();
    if (entry?.modal) {
      let branch: HTMLElement = entry.scope;
      for (let parent = branch.parentElement; parent; parent = branch.parentElement) {
        for (const sibling of parent.children) {
          if (sibling !== branch && sibling instanceof HTMLElement) inertNodes.hold(sibling);
        }
        branch = parent;
      }
    }
    observer.takeRecords();
  }

  function containFocus() {
    const entry = top();
    if (entry?.modal && !entry.dialog.contains(doc.activeElement)) focusInitial(entry);
  }

  function onKeyDown(e: KeyboardEvent) {
    const entry = top();
    if (!entry || e.defaultPrevented) return;
    if (e.key === 'Escape') {
      // Even a non-dismissible age gate must consume Escape so App cannot handle it.
      e.preventDefault();
      entry.onEscape();
    } else if (e.key === 'Tab' && entry.modal) {
      e.preventDefault();
      const controls = focusableElements(entry.dialog);
      const index = nextDialogFocusIndex(controls.findIndex((el) => el === doc.activeElement), controls.length, e.shiftKey);
      (controls[index] ?? entry.dialog).focus({ preventScroll: true });
    }
  }

  const observer = new MutationObserver((records) => { noteExternalWrites(records); updateInert(); containFocus(); });

  return {
    attach(entry: DialogEntry) {
      if (entries.length === 0) {
        doc.addEventListener('keydown', onKeyDown, true);
        doc.addEventListener('focusin', containFocus, true);
        observer.observe(doc.body, { childList: true, subtree: true, attributeFilter: ['inert'] });
      }
      // React runs a child's layout effects before its parent's, so a dialog that mounts together
      // with one inside it attaches second. Keep it below its descendants, and let it return to the
      // opener they captured (it saw focus inside itself and kept none).
      const inside = entries.findIndex((item) => entry.dialog.contains(item.dialog));
      const placed = inside === -1 ? entry : { ...entry, returnTo: entry.returnTo ?? entries[inside]?.returnTo ?? null };
      entries = inside === -1 ? [...entries, placed] : [...entries.slice(0, inside), placed, ...entries.slice(inside)];
      updateInert();
      if (top() === placed) focusInitial(placed);
      return () => {
        const wasTop = top() === placed;
        entries = entries.filter((item) => item !== placed);
        updateInert();
        if (entries.length === 0) {
          observer.disconnect();
          doc.removeEventListener('keydown', onKeyDown, true);
          doc.removeEventListener('focusin', containFocus, true);
        }
        if (!wasTop) return;
        const next = top();
        const opener = placed.returnTo;
        if (opener?.isConnected && !opener.closest('[inert]') && (!next || next.dialog.contains(opener))) {
          opener.focus({ preventScroll: true });
        } else if (next) focusInitial(next);
      };
    },
    ensureFocus(dialog: HTMLElement) {
      if (top()?.dialog !== dialog) return;
      updateInert();
      containFocus();
    },
  };
}

const managers = new WeakMap<Document, ReturnType<typeof createDialogManager>>();

/** Attach the returned ref to a named dialog with tabIndex={-1}. */
export function useDialogFocus<T extends HTMLElement>({ active = true, modal = true, onEscape, initialFocusRef, returnFocusRef, isolationRef }: DialogOptions = {}) {
  const dialogRef = useRef<T>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const latest = useRef({ onEscape, initialFocusRef });
  const registration = useRef<{ readonly dialog: HTMLElement; readonly scope: HTMLElement; readonly modal: boolean; readonly dispose: () => void } | null>(null);

  useLayoutEffect(() => {
    latest.current = { onEscape, initialFocusRef };
    const dialog = dialogRef.current;
    const scope = isolationRef?.current ?? dialog;
    const current = registration.current;
    // A responsive dialog can replace its DOM root without closing its component.
    if (current && (!active || current.dialog !== dialog || current.scope !== scope || current.modal !== modal)) {
      current.dispose();
      registration.current = null;
    }
    if (!active) { openerRef.current = null; return; }
    if (!dialog || !scope) return;
    const doc = dialog.ownerDocument;
    // StrictMode can replay setup while our own initial target is still focused.
    if (openerRef.current === null) {
      const focused = doc.activeElement;
      openerRef.current = returnFocusRef?.current
        ?? (focused instanceof HTMLElement && !dialog.contains(focused) ? focused : null);
    }
    let manager = managers.get(doc);
    if (!manager) { manager = createDialogManager(doc); managers.set(doc, manager); }
    if (!registration.current) {
      const dispose = manager.attach({
        dialog, scope, modal, returnTo: openerRef.current,
        initialFocus: () => latest.current.initialFocusRef?.current ?? null,
        onEscape: () => latest.current.onEscape?.(),
      });
      registration.current = { dialog, scope, modal, dispose };
    }
    // Busy states and conditional content can remove the focused control.
    manager.ensureFocus(dialog);
  });

  useLayoutEffect(() => () => {
    registration.current?.dispose();
    registration.current = null;
  }, []);
  return dialogRef;
}
