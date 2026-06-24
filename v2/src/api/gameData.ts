import type { Game, GameData, GameCategory } from '@/shared/types/game';
import { GameDataResponseSchema } from './schemas';

// ─── Game URL builders (from feeder providerRef) ─────────────────────────────
const GLADIATOR_CDN = 'https://cdn-dev.gladiatorgames.io/games';
const METAWIN_CDN = 'https://cdn-dev.mwgames.io/metawin';
const IMG_CDN = 'https://content.prod.platform.mwapp.io/games';

// ─── Gladiator Slots (providerRef from feeder gameCatalogData.ts) ────────────

export const GLADIATOR_SLOTS: readonly Game[] = [
  { id: 10000, slug: 'gladiator-eyes-of-medusa', title: 'Eyes of Medusa', description: 'Gorgon-themed fantasy slot — tumbling reels, scatters, and free-spin multipliers that turn wins to stone.', image: `${IMG_CDN}/eyes-of-medusa-vertical.jpg`, landscapeImage: `${IMG_CDN}/eyes-of-medusa-horizontal.png`, link: `${GLADIATOR_CDN}/medusa`, timeline: '2025-12-01', rtp: 96.5, volatility: 'ULTRA', genre: 'Mythology', isHot: true, category: 'slot' },
  { id: 9785, slug: 'gladiator-candy-cash-100k', title: 'Candy Cash', description: 'Sweet cluster-pays slot bursting with cascading multipliers and a bonus buy.', image: `${IMG_CDN}/candy-cash-new.jpg`, landscapeImage: `${IMG_CDN}/candy-cash-horizontal.png`, link: `${GLADIATOR_CDN}/sweety-cluster-100k`, timeline: '2025-11-01', rtp: 97, volatility: 'ULTRA', genre: 'Sweets', isHot: true, category: 'slot' },
  { id: 9727, slug: 'thunder-tavern', title: 'Thunder Tavern', description: 'Norse tavern brawl — wilds, scatters, and stacked multipliers across thunderous free spins.', image: `${IMG_CDN}/thunder-tavern-vertical.jpg`, landscapeImage: `${IMG_CDN}/thunder-tavern-new5.png`, link: `${GLADIATOR_CDN}/valhalla-100k`, timeline: '2025-10-01', rtp: 96.8, volatility: 'ULTRA', genre: 'Norse', isHot: true, category: 'slot' },
  { id: 9577, slug: 'rise-of-cetus', title: 'Rise of Cetus', description: 'Mythic fantasy slot with colossal multipliers dragged up from the deep.', image: `${IMG_CDN}/rise-of-cetus-new.jpg`, landscapeImage: `${IMG_CDN}/rise-of-cetus-new5.png`, link: `${GLADIATOR_CDN}/kraken-100k`, timeline: '2025-03-01', rtp: 96.8, volatility: 'ULTRA', genre: 'Fantasy', isHot: true, category: 'slot' },
  { id: 9244, slug: 'legend-of-tartarus', title: 'Legend of Tartarus', description: 'Spine-chilling horror slot with brutal win mechanics and bonus buys.', image: `${IMG_CDN}/legend-of-tartarus-new.jpg`, landscapeImage: `${IMG_CDN}/tartarus-new5.png`, link: `${GLADIATOR_CDN}/tartarus-100k`, timeline: '2025-01-15', rtp: 97.5, volatility: 'ULTRA', genre: 'Horror', isHot: true, category: 'slot' },
  { id: 9367, slug: 'gladiator-star-nudge', title: 'Star Nudge', description: 'Cosmic nudge slot with sticky wilds and celestial multipliers.', image: `${IMG_CDN}/star-nudge.png`, landscapeImage: `${IMG_CDN}/star-nudge-new5.png`, link: `${GLADIATOR_CDN}/fruit-nudge`, timeline: '2024-11-01', rtp: 96.5, volatility: 'ULTRA', genre: 'Stars', category: 'slot' },
  { id: 4544, slug: 'gladiator-to-the-top', title: 'To The Top', description: 'Vertical slot adventure — every spin climbs toward bigger multipliers.', image: `${IMG_CDN}/ttt-cover-3.png`, landscapeImage: `${IMG_CDN}/to-the-top-new5.png`, link: `${GLADIATOR_CDN}/to-the-top`, timeline: '2024-10-01', rtp: 96.51, volatility: 'ULTRA', genre: 'Fantasy', isHot: true, category: 'slot' },
  { id: 7899, slug: 'gladiator-all-about-the-fish', title: 'All About The Fish', description: 'Underwater adventure with ocean-deep multipliers and free spins.', image: `${IMG_CDN}/all-about-the-fish.png`, landscapeImage: `${IMG_CDN}/all-about-the-fish-new5.png`, link: `${GLADIATOR_CDN}/all-about-the-fish`, timeline: '2024-09-01', rtp: 96.4, volatility: 'ULTRA', genre: 'Underwater', category: 'slot' },
  { id: 8721, slug: 'gladiator-disco-dazzle', title: 'Disco Dazzle', description: 'Retro disco fever with wilds and ULTRA-volatility multipliers.', image: `${IMG_CDN}/disco-dazzle.png`, landscapeImage: `${IMG_CDN}/disco-dazzle-new5.png`, link: `${GLADIATOR_CDN}/disco-dazzle`, timeline: '2024-08-01', rtp: 96.4, volatility: 'ULTRA', genre: 'Disco', category: 'slot' },
  { id: 5164, slug: 'gladiator-maneater', title: 'Man Eater', description: 'High-adrenaline action slot with savage payouts.', image: `${IMG_CDN}/maneater-icon-5.png`, landscapeImage: `${IMG_CDN}/man-eater-new5.png`, link: `${GLADIATOR_CDN}/man-eater`, timeline: '2024-07-01', rtp: 96.48, volatility: 'ULTRA', genre: 'Action', category: 'slot' },
  { id: 7569, slug: 'gladiator-sweety-treaty', title: 'Sweety Treaty', description: 'Confectionery slot with cascading wins and a bonus buy.', image: `${IMG_CDN}/sweety-treaty-prod.jpeg`, landscapeImage: `${IMG_CDN}/sweety-treaty-new5.png`, link: `${GLADIATOR_CDN}/sweety-treaty`, timeline: '2024-04-01', rtp: 96.5, volatility: 'ULTRA', genre: 'Sweets', category: 'slot' },
];

// ─── MetaWin Originals (providerRef from feeder gameCatalogData.ts) ──────────

export const METAWIN_ORIGINALS: readonly Game[] = [
  { id: 9999, slug: 'mw-plinko-100k', title: 'Plinko - World Cup Edition', description: 'World-Cup Plinko — drop the ball and bounce through the pins for multiplying payouts.', image: `${IMG_CDN}/plinko-world-cup-edition.jpg`, link: `${METAWIN_CDN}/plinko-100k?provider=metawin&version=wc`, timeline: '2025-12-01', rtp: 98, volatility: 'ULTRA', genre: 'Plinko', isHot: true, category: 'mini' },
  { id: 9715, slug: 'mw-prime-dice', title: 'Prime Dice', description: 'Roll the dice with customizable odds and instant payouts.', image: `${IMG_CDN}/PRIME-DICE-new.png`, link: `${METAWIN_CDN}/prime-dice?provider=metawin`, timeline: '2025-10-01', rtp: 98, volatility: 'HIGH', genre: 'Dice', category: 'mini' },
  { id: 9714, slug: 'mw-roulette-pro', title: 'Roulette Pro', description: 'Pro-grade crypto roulette — place your bets and spin the wheel.', image: `${IMG_CDN}/ROULETTE-PRO-new.png`, link: `${METAWIN_CDN}/roulette1?provider=metawin`, timeline: '2025-09-01', rtp: 97.3, volatility: 'HIGH', genre: 'Roulette', category: 'mini' },
  { id: 9713, slug: 'mw-cases', title: 'Cases', description: 'Open cases for a shot at escalating multipliers.', image: `${IMG_CDN}/CASES-new.png`, link: `${METAWIN_CDN}/cases?provider=metawin`, timeline: '2025-08-01', rtp: 98, volatility: 'HIGH', genre: 'Cases', category: 'mini' },
  { id: 9712, slug: 'mw-bars', title: 'Bars', description: 'Classic bars reel with crypto-native instant wins.', image: `${IMG_CDN}/BARS-new.png`, link: `${METAWIN_CDN}/bars?provider=metawin`, timeline: '2025-07-01', rtp: 98, volatility: 'HIGH', genre: 'Reels', category: 'mini' },
  { id: 9711, slug: 'mw-packs', title: 'Packs', description: 'Rip open packs for stacked multiplier rewards.', image: `${IMG_CDN}/packs-new-1.png`, link: `${METAWIN_CDN}/packs?provider=metawin`, timeline: '2025-06-01', rtp: 98, volatility: 'HIGH', genre: 'Cases', category: 'mini' },
  { id: 9242, slug: 'mw-flip', title: 'Coin Flip', description: 'Double or nothing — a pure 50/50 crypto flip.', image: `${IMG_CDN}/coin-flip-new.png`, link: `${METAWIN_CDN}/flip?provider=metawin`, timeline: '2025-02-15', rtp: 98, volatility: 'HIGH', genre: 'Coin Flip', category: 'mini' },
  { id: 9243, slug: 'mw-darts', title: 'Darts', description: 'Skill-based darts with multiplier targets.', image: `${IMG_CDN}/darts-new.png`, link: `${METAWIN_CDN}/darts?provider=metawin`, timeline: '2025-02-01', rtp: 98, volatility: 'HIGH', genre: 'Darts', category: 'mini' },
  { id: 9240, slug: 'mw-snakes', title: 'Snakes', description: 'Slither up the board, dodging snakes for bigger multipliers.', image: `${IMG_CDN}/snakes-new.png`, link: `${METAWIN_CDN}/snakes?provider=metawin`, timeline: '2025-01-01', rtp: 98, volatility: 'HIGH', genre: 'Snakes', category: 'mini' },
  { id: 9070, slug: 'mw-pump', title: 'Pump', description: 'Pump the balloon and cash out before it pops.', image: `${IMG_CDN}/pump-new.png`, link: `${METAWIN_CDN}/pump?provider=metawin`, timeline: '2024-12-01', rtp: 98, volatility: 'HIGH', genre: 'Crash', category: 'mini' },
  { id: 8812, slug: 'mw-navigator', title: 'Navigator', description: 'Chart your course and cash out before the multiplier flies away.', image: `${IMG_CDN}/navigator-new.png`, link: `${METAWIN_CDN}/aviator?provider=metawin`, timeline: '2024-10-01', rtp: 97, volatility: 'ULTRA', genre: 'Crash', isHot: true, category: 'mini' },
  { id: 8681, slug: 'mw-video-poker', title: 'Video Poker', description: 'Classic 5-card draw video poker.', image: `${IMG_CDN}/video-poker-new.png`, link: `${METAWIN_CDN}/videopoker?provider=metawin`, timeline: '2024-09-01', rtp: 99, volatility: 'HIGH', genre: 'Poker', category: 'mini' },
  { id: 8680, slug: 'mw-baccarat', title: 'MetaWin Baccarat', description: 'High-stakes baccarat at 99.5% RTP.', image: `${IMG_CDN}/BACCARAT-new2.png`, link: `${METAWIN_CDN}/baccarat?provider=metawin`, timeline: '2024-08-15', rtp: 99.5, volatility: 'HIGH', genre: 'Baccarat', category: 'mini' },
  { id: 8679, slug: 'mw-roulette', title: 'Roulette', description: 'Classic European roulette, crypto-native.', image: `${IMG_CDN}/ROULETTE-new.png`, link: `${METAWIN_CDN}/roulette?provider=metawin`, timeline: '2024-08-01', rtp: 97.3, volatility: 'HIGH', genre: 'Roulette', category: 'mini' },
  { id: 6972, slug: 'mw-blackjack', title: 'MetaWin Blackjack', description: 'Beat the dealer at 99.5% RTP.', image: `${IMG_CDN}/blackjack-new2.png`, link: `${METAWIN_CDN}/blackjack?provider=metawin`, timeline: '2024-06-01', rtp: 99.5, volatility: 'HIGH', genre: 'Blackjack', category: 'mini' },
  { id: 6536, slug: 'mw-crash', title: 'Crash', description: 'Ride the multiplier — cash out before it crashes.', image: `${IMG_CDN}/CRASH-new2.png`, link: `${METAWIN_CDN}/crash0?provider=metawin`, timeline: '2024-05-15', rtp: 98, volatility: 'ULTRA', genre: 'Crash', isHot: true, category: 'mini' },
  { id: 6535, slug: 'mw-dragon-tower', title: 'Dragon Tower', description: 'Climb dragon-guarded floors for escalating wins.', image: `${IMG_CDN}/dragon-tower-new.png`, link: `${METAWIN_CDN}/dragon-tower?provider=metawin`, timeline: '2024-05-01', rtp: 98, volatility: 'ULTRA', genre: 'Tower', category: 'mini' },
  { id: 6534, slug: 'mw-diamonds', title: 'Diamonds', description: 'Cascading diamond multiplier wins.', image: `${IMG_CDN}/diamonds-new-1.png`, link: `${METAWIN_CDN}/diamonds?provider=metawin`, timeline: '2024-04-15', rtp: 98.3, volatility: 'ULTRA', genre: 'Gems', category: 'mini' },
  { id: 6973, slug: 'mw-hilo', title: 'Hi-Lo', description: 'Predict higher or lower to build your multiplier.', image: `${IMG_CDN}/hi-lo-new.png`, link: `${METAWIN_CDN}/hilo?provider=metawin`, timeline: '2024-04-01', rtp: 98, volatility: 'HIGH', genre: 'Cards', category: 'mini' },
  { id: 8682, slug: 'mw-slide', title: 'Slide', description: 'Slide the marker and bank the multiplier before it stops.', image: `${IMG_CDN}/slides-new.png`, link: `${METAWIN_CDN}/slide?provider=metawin`, timeline: '2023-12-15', rtp: 98, volatility: 'HIGH', genre: 'Slide', category: 'mini' },
  { id: 6974, slug: 'mw-wheel', title: 'Wheel', description: 'Spin the wheel of fortune for instant multiplier wins.', image: `${IMG_CDN}/wheel-new.png`, link: `${METAWIN_CDN}/wheel?provider=metawin`, timeline: '2023-12-10', rtp: 98, volatility: 'HIGH', genre: 'Wheel', category: 'mini' },
  { id: 5784, slug: 'mw-pepes-river-run', title: "Pepe's River Run", description: 'Hop Pepe across the river, banking multipliers each lane.', image: `${IMG_CDN}/pepes-river-run-new.png`, link: `${METAWIN_CDN}/frog-crossing?provider=metawin`, timeline: '2024-03-01', rtp: 96, volatility: 'HIGH', genre: 'Adventure', category: 'mini' },
  { id: 5247, slug: 'mw-keno', title: 'Keno', description: 'Classic lottery-style number draw.', image: `${IMG_CDN}/keno-new.png`, link: `${METAWIN_CDN}/keno?provider=metawin`, timeline: '2024-02-01', rtp: 98, volatility: 'HIGH', genre: 'Keno', category: 'mini' },
  { id: 4148, slug: 'mw-plinko', title: 'Plinko', description: 'Drop the ball — bounce through pins to multipliers.', image: `${IMG_CDN}/plinko-new.png`, link: `${METAWIN_CDN}/plinko?provider=metawin`, timeline: '2023-05-01', rtp: 98, volatility: 'HIGH', genre: 'Plinko', category: 'mini' },
  { id: 3934, slug: 'mw-mines', title: 'Mines', description: 'Tap safe tiles and avoid the mines to grow your win.', image: `${IMG_CDN}/mines-new.png`, link: `${METAWIN_CDN}/mines?provider=metawin`, timeline: '2023-04-15', rtp: 98, volatility: 'ULTRA', genre: 'Mines', category: 'mini' },
  { id: 3933, slug: 'mw-limbo', title: 'Limbo', description: 'Set your target multiplier and ride the odds.', image: `${IMG_CDN}/limbo-new.png`, link: `${METAWIN_CDN}/limbo?provider=metawin`, timeline: '2023-04-10', rtp: 98, volatility: 'ULTRA', genre: 'Crash', category: 'mini' },
  { id: 3932, slug: 'mw-dice', title: 'Dice', description: 'Simple dice with customizable win chance.', image: `${IMG_CDN}/dice-new-1.png`, link: `${METAWIN_CDN}/dice?provider=metawin`, timeline: '2023-06-01', rtp: 98, volatility: 'HIGH', genre: 'Dice', category: 'mini' },
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
/** Game launch URLs need a lowercase `?provider=` query or the embed won't open. */
function ensureProvider(link: string, provider: string): string {
  if (!link || /[?&]provider=/i.test(link)) return link;
  return `${link}${link.includes('?') ? '&' : '?'}provider=${provider}`;
}

function resolveImage(liveImage: string, meta: Game | undefined): string | undefined {
  if (/^https?:\/\//i.test(liveImage)) return liveImage;
  if (meta?.image) return meta.image;
  if (liveImage) return `${IMG_CDN}/${liveImage.split('/').pop()}`;
  return undefined;
}

/** Metadata for live-only titles not yet in the curated catalogue (new releases). */
const EXTRA_META: Record<string, { readonly genre: string; readonly volatility?: 'HIGH' | 'ULTRA'; readonly isHot?: boolean }> = {
  rekt: { genre: 'Crash', volatility: 'HIGH', isHot: true },
};

/** Merge an authoritative live game with curated cover/metadata where available. */
function enrich(live: LiveGame, category: GameCategory): Game {
  const meta = findMeta(live.title);
  const extra = EXTRA_META[titleKey(live.title)];
  return {
    id: live.id,
    title: live.title,
    description: live.description || meta?.description || '',
    // Slots open without a provider param; minis need lowercase ?provider=metawin.
    link: category === 'slot' ? live.link : ensureProvider(live.link, 'metawin'),
    timeline: live.timeline,
    category,
    slug: meta?.slug,
    image: resolveImage(live.image, meta), // absolute API url → curated → CDN basename
    landscapeImage: meta?.landscapeImage,  // wide key-art for the featured spotlight
    rtp: meta?.rtp, // hidden in the card when unknown
    volatility: meta?.volatility ?? extra?.volatility ?? (category === 'slot' ? 'ULTRA' : 'HIGH'),
    genre: meta?.genre ?? extra?.genre ?? (category === 'slot' ? 'Slot' : 'Original'),
    isHot: meta?.isHot ?? extra?.isHot,
  };
}

/**
 * The curated lists are the authoritative MetaWin/Gladiator catalogue (full real
 * roster with art / RTP / volatility). They are the baseline that is always shown
 * in full; any live-only titles from the lobby API (new releases not yet curated)
 * are appended. Deduped by loose title key so the same game is never doubled.
 */
function mergeCatalogue(curated: readonly Game[], live: readonly Game[]): Game[] {
  const seen = new Set(curated.map((g) => titleKey(g.title)));
  const extras = live.filter((g) => !seen.has(titleKey(g.title)));
  return [...curated, ...extras];
}

/**
 * Fetch the live catalogue from the lobby API, enrich each entry with curated
 * artwork + RTP/volatility/genre by title, and MERGE it onto the full curated
 * roster (so the whole real catalogue always shows, plus any new live releases).
 * Falls back to the curated list on network or validation failure.
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
      slotGames: mergeCatalogue(GLADIATOR_SLOTS, parsed.slotGames.map((g) => enrich(g, 'slot'))),
      miniGames: mergeCatalogue(METAWIN_ORIGINALS, parsed.miniGames.map((g) => enrich(g, 'mini'))),
    };
  } catch (err) {
    console.warn('[gameData] live fetch failed — using curated fallback:', err);
    return FALLBACK_GAMES;
  }
}
