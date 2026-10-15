import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { pageTransition, type PageDestination } from './pageTransitionStore';
import { usePageBodyReady } from './usePageBodyReady';

/** Keep the partner hero outside its lazy body until the camera has landed. */
export function PageBodyGate({ page, fallback, children }: {
  readonly page: PageDestination;
  readonly fallback: ReactNode;
  readonly children: ReactNode;
}) {
  const ready = usePageBodyReady(page);
  const rootRef = useRef<HTMLDivElement>(null), titleFocused = useRef(false);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const doc = root.ownerDocument;
    const noteFocus = () => { titleFocused.current = doc.activeElement === root.querySelector('h1'); };
    const observer = new MutationObserver(() => {
      const state = pageTransition.getSnapshot();
      if (!titleFocused.current || (state.sceneAvailable && state.phase !== 'settled')) return;
      const title = root.querySelector<HTMLElement>('h1');
      if (title && doc.activeElement !== title) title.focus({ preventScroll: true });
    });
    observer.observe(root, { childList: true, subtree: true });
    doc.addEventListener('focusin', noteFocus, true);
    return () => { observer.disconnect(); doc.removeEventListener('focusin', noteFocus, true); };
  }, []);
  useLayoutEffect(() => {
    // Replacing the pending hero must not send title focus back to the Close control.
    // A focus move anywhere else clears this intent, so loading never steals a visitor's selection.
    if (ready && titleFocused.current) rootRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [ready]);
  return <div ref={rootRef} data-page-body="" aria-busy={!ready}>{ready ? children : fallback}</div>;
}
