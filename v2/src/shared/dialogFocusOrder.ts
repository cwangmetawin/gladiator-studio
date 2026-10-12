/** -1 selects the dialog container when there are no tabbable controls. */
export function nextDialogFocusIndex(currentIndex: number, count: number, backward = false): number {
  if (count === 0) return -1;
  if (currentIndex < 0 || currentIndex >= count) return backward ? count - 1 : 0;
  return (currentIndex + (backward ? count - 1 : 1)) % count;
}
