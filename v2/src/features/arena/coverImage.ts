import type { SyntheticEvent } from 'react';

/** A baked cover that fails to load retries the catalogue image once, then hides itself. */
export function coverError(event: SyntheticEvent<HTMLImageElement>, fallback: string) {
  const image = event.currentTarget;
  if (fallback && image.dataset.fallback !== 'true') { image.dataset.fallback = 'true'; image.src = fallback; }
  else image.hidden = true;
}
