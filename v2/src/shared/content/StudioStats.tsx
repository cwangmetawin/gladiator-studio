import { createContext, useContext, type ReactNode } from 'react';
import { useSection } from './SiteContentContext';

// ─── Studio numbers ─────────────────────────────────────────────────────────
// games / slots / originals are AUTO-COUNTED from the live catalogue (single
// source of truth — never hand-typed). markets / rtp / years are marketing
// figures that can't be computed, so they're edited ONCE in the admin's
// "Studio Stats" section and shared across Hero, About and Team.

export interface CatalogueCounts {
  readonly games: number;
  readonly slots: number;
  readonly originals: number;
}

const CountsCtx = createContext<CatalogueCounts>({ games: 0, slots: 0, originals: 0 });

export function CatalogueStatsProvider({ counts, children }: { readonly counts: CatalogueCounts; readonly children: ReactNode }) {
  return <CountsCtx.Provider value={counts}>{children}</CountsCtx.Provider>;
}

export interface StudioStats extends CatalogueCounts {
  readonly markets: number;
  readonly rtp: number;
  readonly years: number;
}

export function useStudioStats(): StudioStats {
  const counts = useContext(CountsCtx);
  const s = useSection('stats', { markets: 7, rtp: 97.5, years: 10 });
  return {
    ...counts,
    markets: Number(s.markets) || 0,
    rtp: Number(s.rtp) || 0,
    years: Number(s.years) || 0,
  };
}
