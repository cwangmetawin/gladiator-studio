export type GameCategory = 'slot' | 'mini';

export interface Game {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  /** Cover art URL. Optional — a fallback cover renders when absent or broken. */
  readonly image?: string;
  readonly link: string;
  readonly timeline: string;
  readonly category: GameCategory;
  readonly slug?: string;
  /** Enriched metadata — present for catalogued titles, optional for live-only ones. */
  readonly rtp?: number;
  readonly volatility?: 'HIGH' | 'ULTRA';
  readonly genre?: string;
  readonly isHot?: boolean;
}

export interface GameData {
  readonly slotGames: readonly Game[];
  readonly miniGames: readonly Game[];
}
