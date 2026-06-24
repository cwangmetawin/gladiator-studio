import { GLADIATOR_SLOTS, METAWIN_ORIGINALS } from '@/api/gameData';

// ─── Live-feed game lookup ──────────────────────────────────────────────────
// Classification + thumbnails for the live activity feed are derived from the
// REAL curated catalogue (gameData.ts), so any game we ship — including new
// slots like Eyes of Medusa — is recognised, shown, and beamed onto the globe.
// A small alias table maps socket-specific game-name variants back to catalogue
// entries (the live feed uses slightly different names for some game modes).

export type LiveProvider = 'gladiator' | 'original' | 'other';

export interface CatalogueEntry {
  readonly title: string;
  readonly image?: string;
  readonly provider: 'gladiator' | 'original';
}

/** Normalise a game name for tolerant matching (case/diacritics/punctuation). */
export function normalizeGameName(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build the primary lookup from curated catalogue titles.
const byName = new Map<string, CatalogueEntry>();
for (const g of GLADIATOR_SLOTS) {
  byName.set(normalizeGameName(g.title), { title: g.title, image: g.image, provider: 'gladiator' });
}
for (const g of METAWIN_ORIGINALS) {
  byName.set(normalizeGameName(g.title), { title: g.title, image: g.image, provider: 'original' });
}

// Socket-name variants → a catalogue key already present in `byName`.
// (Game modes the feed reports under a different name than the catalogue.)
const ALIASES: Readonly<Record<string, string>> = {
  maneater: 'man eater',
  aviator: 'navigator',
  'plinko world cup edition': 'plinko - world cup edition',
  'limbo zero': 'limbo',
  'dice zero': 'dice',
  'mines zero': 'mines',
  'roulette zero': 'roulette',
  'dragon tower zero': 'dragon tower',
  blackjack: 'metawin blackjack',
  baccarat: 'metawin baccarat',
};

/** Resolve a (possibly variant) socket game name to a curated catalogue entry. */
export function lookupGame(name: string): CatalogueEntry | undefined {
  const key = normalizeGameName(name);
  const direct = byName.get(key);
  if (direct) return direct;
  const aliased = ALIASES[key];
  if (aliased) return byName.get(aliased);
  return undefined;
}

/** Classify a socket game by provider; 'other' = untracked third-party (hidden). */
export function classifyProvider(name: string): LiveProvider {
  const entry = lookupGame(name);
  if (entry) return entry.provider;
  // MetaWin-branded titles we haven't curated yet still count as Originals.
  return normalizeGameName(name).includes('metawin') ? 'original' : 'other';
}
