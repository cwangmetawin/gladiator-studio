import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Game, GameData } from '@/shared/types/game';
import { catalogueMaxRtp } from '@/shared/utils/gameRtp';
import { useSection } from './SiteContentContext';

// ─── Studio numbers ─────────────────────────────────────────────────────────
// games / slots / originals / max RTP are DERIVED from the live catalogue (single
// source of truth — never hand-typed). markets / years are marketing figures
// that can't be computed, so they're edited ONCE in the admin's "Studio Stats"
// section and shared across Hero, About and Team.

export interface CatalogueCounts {
  readonly games: number;
  readonly slots: number;
  readonly originals: number;
}

const CatalogueCtx = createContext<GameData>({ slotGames: [], miniGames: [] });

export function CatalogueStatsProvider({ catalogue, children }: { readonly catalogue: GameData; readonly children: ReactNode }) {
  return <CatalogueCtx.Provider value={catalogue}>{children}</CatalogueCtx.Provider>;
}

export function useCatalogueGames(): readonly Game[] {
  const { slotGames, miniGames } = useContext(CatalogueCtx);
  return useMemo(() => [...slotGames, ...miniGames], [slotGames, miniGames]);
}

export interface StudioStats extends CatalogueCounts {
  readonly markets: number;
  readonly rtp: number;
  readonly years: number;
}

export function useStudioStats(): StudioStats {
  const games = useCatalogueGames();
  const { slotGames, miniGames } = useContext(CatalogueCtx);
  const s = useSection('stats', { markets: 7, years: 10 });
  return {
    games: games.length,
    slots: slotGames.length,
    originals: miniGames.length,
    markets: Number(s.markets) || 0,
    rtp: catalogueMaxRtp(games),
    years: Number(s.years) || 0,
  };
}
