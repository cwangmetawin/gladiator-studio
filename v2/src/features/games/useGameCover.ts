import { useState } from 'react';
import type { Game } from '@/shared/types/game';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { coverForGame, COVER_MANIFEST } from '@/features/arena/hallManifest';

/** Retry a failed bake once with its live original; a different URL starts fresh. */
export function useGameCover(game: Pick<Game, 'slug' | 'image'>) {
  const phone = useIsMobile(), cover = coverForGame(game, COVER_MANIFEST, phone);
  const [failure, setFailure] = useState<{ readonly url: string; readonly done: boolean } | null>(null);
  const failed = failure?.url === cover.url;
  const src = failed ? (failure?.done ? undefined : cover.fallbackUrl || undefined) : cover.url || undefined;
  return { src, onError: () => setFailure({ url: cover.url, done: failed || cover.url === cover.fallbackUrl }) };
}
