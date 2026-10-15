const POINTABLE = 'a, button, [role="button"], label, summary';

export interface CursorState {
  /** The word an expanded ring shows ([data-cursor], e.g. PLAY over a game card); empty for none. */
  readonly label: string;
  /** A plain control: the ring shrinks to a dot so it never covers the control's own label. */
  readonly point: boolean;
}

/** What the cursor ring should show over the element under the pointer. */
export function cursorState(target: Element | null): CursorState {
  const labelled = target?.closest?.('[data-cursor]') as HTMLElement | null | undefined;
  const label = labelled?.dataset.cursor ?? '';
  if (label) return { label, point: false };
  return { label: '', point: Boolean(target?.closest?.(POINTABLE)) };
}
