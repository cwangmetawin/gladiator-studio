import type { Game, GameData, GameCategory } from '@/shared/types/game';
import { GameDataResponseSchema } from './schemas';

// ─── Game URL builders (from feeder providerRef) ─────────────────────────────
const GLADIATOR_CDN = 'https://cdn-dev.gladiatorgames.io/games';
const METAWIN_CDN = 'https://cdn-dev.mwgames.io/metawin';
const IMG_CDN = 'https://content.prod.platform.mwapp.io/games';

// ─── Gladiator Slots (providerRef from feeder gameCatalogData.ts) ────────────

const GLADIATOR_SLOTS: readonly Game[] = [
  { id: 9244, slug: 'legend-of-tartarus', title: 'Legend of Tartarus', description: 'Spine-chilling horror slot with brutal win mechanics.', image: `${IMG_CDN}/legend-of-tartarus-new.jpg`, link: `${GLADIATOR_CDN}/tartarus-100k`, timeline: '2025-01-15', rtp: 97.5, volatility: 'ULTRA', genre: 'Horror', isHot: true, category: 'slot' },
  { id: 9577, slug: 'rise-of-cetus', title: 'Rise of Cetus', description: 'Mythic fantasy slot with colossal multipliers from the deep.', image: `${IMG_CDN}/rise-of-cetus-new.jpg`, link: `${GLADIATOR_CDN}/kraken-100k`, timeline: '2025-03-01', rtp: 96.8, volatility: 'ULTRA', genre: 'Fantasy', isHot: true, category: 'slot' },
  { id: 9367, slug: 'star-nudge', title: 'Star Nudge', description: 'Cosmic nudge slot with celestial wins.', image: `${IMG_CDN}/star-nudge.png`, link: `${GLADIATOR_CDN}/fruit-nudge`, timeline: '2024-11-01', rtp: 96.5, volatility: 'ULTRA', genre: 'Stars', category: 'slot' },
  { id: 7569, slug: 'sweety-treaty', title: 'Sweety Treaty', description: 'Confectionery slot with cascading wins.', image: `${IMG_CDN}/sweety-treaty-prod.jpeg`, link: `${GLADIATOR_CDN}/sweety-treaty`, timeline: '2024-04-01', rtp: 96.5, volatility: 'ULTRA', genre: 'Sweets', category: 'slot' },
  { id: 8721, slug: 'disco-dazzle', title: 'Disco Dazzle', description: 'Retro disco fever with ULTRA volatility.', image: `${IMG_CDN}/disco-dazzle.png`, link: `${GLADIATOR_CDN}/disco-dazzle`, timeline: '2024-08-01', rtp: 96.4, volatility: 'ULTRA', genre: 'Disco', category: 'slot' },
  { id: 7899, slug: 'all-about-the-fish', title: 'All About The Fish', description: 'Underwater adventure with ocean-deep multipliers.', image: `${IMG_CDN}/all-about-the-fish.png`, link: `${GLADIATOR_CDN}/all-about-the-fish`, timeline: '2024-09-01', rtp: 96.4, volatility: 'ULTRA', genre: 'Underwater', category: 'slot' },
  { id: 5164, slug: 'man-eater', title: 'Man Eater', description: 'High-adrenaline action slot with savage payouts.', image: `${IMG_CDN}/maneater-icon-5.png`, link: `${GLADIATOR_CDN}/man-eater`, timeline: '2024-07-01', rtp: 96.48, volatility: 'ULTRA', genre: 'Action', category: 'slot' },
  { id: 4544, slug: 'to-the-top', title: 'To The Top', description: 'Vertical slot adventure — every spin takes you higher.', image: `${IMG_CDN}/ttt-cover-3.png`, link: `${GLADIATOR_CDN}/to-the-top`, timeline: '2024-10-01', rtp: 96.51, volatility: 'ULTRA', genre: 'Fantasy', isHot: true, category: 'slot' },
];

// ─── MetaWin Originals (providerRef from feeder gameCatalogData.ts) ──────────

const METAWIN_ORIGINALS: readonly Game[] = [
  { id: 9105, slug: 'roulette-zero', title: 'Roulette Zero', description: 'Zero-edge roulette with 100% RTP.', image: `${IMG_CDN}/roulette-zero.jpg`, link: `${METAWIN_CDN}/roulette0`, timeline: '2024-01-01', rtp: 100, volatility: 'HIGH', genre: 'Roulette', category: 'mini' },
  { id: 8679, slug: 'roulette', title: 'Roulette', description: 'Classic European roulette.', image: `${IMG_CDN}/roulette-mw.jpg`, link: `${METAWIN_CDN}/roulette`, timeline: '2024-01-01', rtp: 97.3, volatility: 'HIGH', genre: 'Roulette', category: 'mini' },
  { id: 8680, slug: 'baccarat', title: 'MetaWin Baccarat', description: 'High-stakes baccarat 99.5% RTP.', image: `${IMG_CDN}/baccarat-mw-1.png`, link: `${METAWIN_CDN}/baccarat`, timeline: '2024-01-01', rtp: 99.5, volatility: 'HIGH', genre: 'Baccarat', category: 'mini' },
  { id: 9243, slug: 'darts', title: 'Darts', description: 'Skill-based dart throwing.', image: `${IMG_CDN}/mw-darts.jpg`, link: `${METAWIN_CDN}/darts`, timeline: '2024-06-01', rtp: 98, volatility: 'HIGH', genre: 'Darts', category: 'mini' },
  { id: 9242, slug: 'coin-flip', title: 'Coin Flip', description: 'Double or nothing 50/50 bet.', image: `${IMG_CDN}/mw-coin-flip.jpg`, link: `${METAWIN_CDN}/flip`, timeline: '2024-06-01', rtp: 98, volatility: 'HIGH', genre: 'Coin Flip', category: 'mini' },
  { id: 9240, slug: 'snakes', title: 'Snakes', description: 'Slither through multipliers.', image: `${IMG_CDN}/mw-snakes.png`, link: `${METAWIN_CDN}/snakes`, timeline: '2024-05-01', rtp: 98, volatility: 'HIGH', genre: 'Snakes', category: 'mini' },
  { id: 9070, slug: 'pump', title: 'Pump', description: 'Pump the balloon — cash out before it pops.', image: `${IMG_CDN}/pump.png`, link: `${METAWIN_CDN}/pump`, timeline: '2024-04-01', rtp: 98, volatility: 'HIGH', genre: 'Crash', category: 'mini' },
  { id: 8812, slug: 'navigator', title: 'Navigator', description: 'Chart your course to massive multipliers.', image: `${IMG_CDN}/navigator.png`, link: `${METAWIN_CDN}/aviator`, timeline: '2024-02-01', rtp: 97, volatility: 'ULTRA', genre: 'Aviator', category: 'mini' },
  { id: 8799, slug: 'limbo-zero', title: 'Limbo ZERO', description: 'Zero-edge limbo with infinite multiplier.', image: `${IMG_CDN}/limbo-zero.jpg`, link: `${METAWIN_CDN}/limbo0`, timeline: '2024-02-01', rtp: 100, volatility: 'ULTRA', genre: 'Limbo', category: 'mini' },
  { id: 8798, slug: 'dragon-tower-zero', title: 'Dragon Tower ZERO', description: 'Ascend the tower with zero house edge.', image: `${IMG_CDN}/dragon-tower-zero.jpg`, link: `${METAWIN_CDN}/dragon-tower0`, timeline: '2024-02-01', rtp: 100, volatility: 'ULTRA', genre: 'Tower', category: 'mini' },
  { id: 8785, slug: 'mines-zero', title: 'Mines ZERO', description: 'Navigate the minefield with 100% RTP.', image: `${IMG_CDN}/mines-zero.jpg`, link: `${METAWIN_CDN}/mines0`, timeline: '2024-02-01', rtp: 100, volatility: 'ULTRA', genre: 'Mining', category: 'mini' },
  { id: 8771, slug: 'dice-zero', title: 'Dice ZERO', description: 'Roll the dice with zero edge.', image: `${IMG_CDN}/dice-zero.jpg`, link: `${METAWIN_CDN}/dice0`, timeline: '2024-02-01', rtp: 100, volatility: 'ULTRA', genre: 'Dice', category: 'mini' },
  { id: 8682, slug: 'slide', title: 'Slide', description: 'Slide into multipliers.', image: `${IMG_CDN}/slide-mw.png`, link: `${METAWIN_CDN}/slide`, timeline: '2024-01-01', rtp: 98, volatility: 'HIGH', genre: 'Slide', category: 'mini' },
  { id: 8681, slug: 'video-poker', title: 'Video Poker', description: 'Classic 5-card draw.', image: `${IMG_CDN}/video-poker-mw.png`, link: `${METAWIN_CDN}/videopoker`, timeline: '2024-01-01', rtp: 99, volatility: 'HIGH', genre: 'Poker', category: 'mini' },
  { id: 3932, slug: 'dice', title: 'Dice', description: 'Simple dice with customizable odds.', image: `${IMG_CDN}/new-dice.jpg`, link: `${METAWIN_CDN}/dice`, timeline: '2023-06-01', rtp: 98, volatility: 'HIGH', genre: 'Dice', category: 'mini' },
  { id: 6974, slug: 'wheel', title: 'Wheel', description: 'Spin the wheel for instant wins.', image: `${IMG_CDN}/mw-wheel.jpg`, link: `${METAWIN_CDN}/wheel`, timeline: '2023-12-01', rtp: 98, volatility: 'HIGH', genre: 'Wheel', category: 'mini' },
  { id: 6973, slug: 'hi-lo', title: 'Hi-Lo', description: 'Predict higher or lower.', image: `${IMG_CDN}/mw-hilo.jpg`, link: `${METAWIN_CDN}/hilo`, timeline: '2023-12-01', rtp: 98, volatility: 'HIGH', genre: 'Hi-Lo', category: 'mini' },
  { id: 6972, slug: 'blackjack', title: 'MetaWin Blackjack', description: 'Beat the dealer 99.5% RTP.', image: `${IMG_CDN}/mw-blackjack.jpg`, link: `${METAWIN_CDN}/blackjack`, timeline: '2023-12-01', rtp: 99.5, volatility: 'HIGH', genre: 'Blackjack', category: 'mini' },
  { id: 6536, slug: 'crash', title: 'Crash', description: 'Ride the multiplier — cash out before it crashes.', image: `${IMG_CDN}/mw-crash-1.jpg`, link: `${METAWIN_CDN}/crash0`, timeline: '2023-09-01', rtp: 98, volatility: 'ULTRA', genre: 'Crash', category: 'mini' },
  { id: 6535, slug: 'dragon-tower', title: 'Dragon Tower', description: 'Climb dragon-guarded floors.', image: `${IMG_CDN}/mw-dragon-tower-1.jpg`, link: `${METAWIN_CDN}/dragon-tower`, timeline: '2023-09-01', rtp: 98, volatility: 'HIGH', genre: 'Tower', category: 'mini' },
  { id: 6534, slug: 'diamonds', title: 'Diamonds', description: 'Cascading diamond multiplier wins.', image: `${IMG_CDN}/mw-diamonds.jpg`, link: `${METAWIN_CDN}/diamonds`, timeline: '2023-09-01', rtp: 98.3, volatility: 'HIGH', genre: 'Gems', category: 'mini' },
  { id: 5784, slug: 'pepes-river-run', title: "Pepe's River Run", description: 'Cross the river with Pepe.', image: `${IMG_CDN}/pepes-river-run.jpg`, link: `${METAWIN_CDN}/frog-crossing`, timeline: '2023-07-01', rtp: 96, volatility: 'HIGH', genre: 'Adventure', category: 'mini' },
  { id: 5247, slug: 'keno', title: 'Keno', description: 'Classic lottery-style game.', image: `${IMG_CDN}/mw-keno.jpg`, link: `${METAWIN_CDN}/keno`, timeline: '2023-06-01', rtp: 98, volatility: 'HIGH', genre: 'Keno', category: 'mini' },
  { id: 4148, slug: 'plinko', title: 'Plinko', description: 'Drop the ball — bounce to multipliers.', image: `${IMG_CDN}/plinko-mw.png`, link: `${METAWIN_CDN}/plinko`, timeline: '2023-05-01', rtp: 98, volatility: 'HIGH', genre: 'Plinko', category: 'mini' },
  { id: 3934, slug: 'mines', title: 'Mines', description: 'Tap safe tiles, avoid the mines.', image: `${IMG_CDN}/mw-mines.jpg`, link: `${METAWIN_CDN}/mines`, timeline: '2023-04-01', rtp: 98, volatility: 'HIGH', genre: 'Mining', category: 'mini' },
  { id: 3933, slug: 'limbo', title: 'Limbo', description: 'Set your target and ride the odds.', image: `${IMG_CDN}/mw-limbo.jpg`, link: `${METAWIN_CDN}/limbo`, timeline: '2023-04-01', rtp: 98, volatility: 'HIGH', genre: 'Limbo', category: 'mini' },
];

const FALLBACK_GAMES: GameData = {
  slotGames: GLADIATOR_SLOTS,
  miniGames: METAWIN_ORIGINALS,
};

// ─── Live catalogue from the lobby API, enriched with curated metadata ────────

const API_URL = 'https://game-lobby-kappa.vercel.app/api/data';
const FETCH_TIMEOUT_MS = 6000;

/** Loose title key so live titles match curated metadata despite minor wording
 *  (drops the "MetaWin"/"the" qualifiers and any punctuation/spacing). */
function titleKey(title: string): string {
  return title.toLowerCase().replace(/\bmetawin\b/g, '').replace(/\bthe\b/g, '').replace(/[^a-z0-9]/g, '');
}

/** Collapse runs of the same letter so typos like "Dazle" still match "Dazzle". */
function dedupeKey(key: string): string {
  return key.replace(/(.)\1+/g, '$1');
}

const CURATED_ALL = [...GLADIATOR_SLOTS, ...METAWIN_ORIGINALS];
const META_BY_TITLE: ReadonlyMap<string, Game> = new Map(CURATED_ALL.map((g) => [titleKey(g.title), g] as const));
const META_BY_DEDUPE: ReadonlyMap<string, Game> = new Map(CURATED_ALL.map((g) => [dedupeKey(titleKey(g.title)), g] as const));

/** Exact key match, then a typo-tolerant deduped-key match. */
function findMeta(title: string): Game | undefined {
  const key = titleKey(title);
  return META_BY_TITLE.get(key) ?? META_BY_DEDUPE.get(dedupeKey(key));
}

interface LiveGame {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly image: string;
  readonly link: string;
  readonly timeline: string;
}

/**
 * Resolve a usable cover URL from the live API value:
 *   1. absolute URL (e.g. imgix) — use as-is (covers the new games)
 *   2. curated cover — known-good CDN art for catalogued titles
 *   3. relative "assets/x.png" — best-effort CDN by basename; GameCard's
 *      onError falls back to the placeholder cover if it 404s.
 */
function resolveImage(liveImage: string, meta: Game | undefined): string | undefined {
  if (/^https?:\/\//i.test(liveImage)) return liveImage;
  if (meta?.image) return meta.image;
  if (liveImage) return `${IMG_CDN}/${liveImage.split('/').pop()}`;
  return undefined;
}

/** Merge an authoritative live game with curated cover/metadata where available. */
function enrich(live: LiveGame, category: GameCategory): Game {
  const meta = findMeta(live.title);
  return {
    id: live.id,
    title: live.title,
    description: live.description || meta?.description || '',
    link: live.link,
    timeline: live.timeline,
    category,
    slug: meta?.slug,
    image: resolveImage(live.image, meta), // absolute API url → curated → CDN basename
    rtp: meta?.rtp, // hidden in the card when unknown
    volatility: meta?.volatility ?? (category === 'slot' ? 'ULTRA' : 'HIGH'),
    genre: meta?.genre ?? (category === 'slot' ? 'Slot' : 'Original'),
    isHot: meta?.isHot,
  };
}

/**
 * Fetch the live catalogue from the lobby API (the source of truth for which
 * games exist), enrich each entry with curated artwork + RTP/volatility/genre
 * by title, and fall back to the curated list on network or validation failure.
 */
export async function fetchGameData(): Promise<GameData> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(API_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = GameDataResponseSchema.parse(await res.json());
    return {
      slotGames: parsed.slotGames.map((g) => enrich(g, 'slot')),
      miniGames: parsed.miniGames.map((g) => enrich(g, 'mini')),
    };
  } catch (err) {
    console.warn('[gameData] live fetch failed — using curated fallback:', err);
    return FALLBACK_GAMES;
  }
}
