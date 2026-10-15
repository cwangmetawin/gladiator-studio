import type { Game } from '@/shared/types/game';
import { CARD_ASPECT, type RGB } from './hallLayout';
import bakedCovers from './gameCovers.json';

export const STEEL_THEME: { readonly primary: RGB; readonly secondary: RGB } = Object.freeze({
  primary: Object.freeze([0.36, 0.50, 0.62] as const), secondary: Object.freeze([0.53, 0.59, 0.63] as const),
});
interface CoverSize { readonly url: string; readonly width: number; readonly height: number; readonly bytes: number }
interface BakedCover {
  readonly source: string;
  readonly widths: Readonly<Record<'320' | '640', CoverSize>>;
  readonly primary: RGB;
  readonly secondary: RGB;
}
export interface CoverManifest { readonly entries: Readonly<Record<string, BakedCover>> }
export interface HallCover {
  readonly url: string;
  readonly fallbackUrl: string;
  readonly width: number;
  readonly height: number;
  readonly primary: RGB;
  readonly secondary: RGB;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const rgb = (value: unknown): value is RGB => Array.isArray(value) && value.length === 3
  && value.every(c => typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= 1);

function coverSize(value: unknown, slug: string, width: number): value is CoverSize {
  return record(value) && typeof value.url === 'string'
    && new RegExp(`^/arena/games/${slug}-${width}-[a-f0-9]{8}\\.webp$`).test(value.url) && value.width === width
    && Number.isInteger(value.height) && Number(value.height) > 0 && Number.isInteger(value.bytes) && Number(value.bytes) > 0;
}

/** Validate baked data at the module boundary. A bad entry never disables other games. */
export function parseCoverManifest(value: unknown): CoverManifest | null {
  if (!record(value) || value.version !== 1 || !record(value.entries)) return null;
  const entries: Record<string, BakedCover> = Object.create(null);
  for (const [slug, item] of Object.entries(value.entries)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !record(item) || typeof item.source !== 'string'
      || !rgb(item.primary) || !rgb(item.secondary) || !record(item.widths)
      || !coverSize(item.widths['320'], slug, 320) || !coverSize(item.widths['640'], slug, 640)) continue;
    entries[slug] = { source: item.source, primary: [...item.primary], secondary: [...item.secondary],
      widths: { '320': { ...item.widths['320'] }, '640': { ...item.widths['640'] } } };
  }
  return { entries };
}

export const COVER_MANIFEST: CoverManifest = parseCoverManifest(bakedCovers) ?? { entries: {} };

export function coverForGame(game: Pick<Game, 'image' | 'slug'>, manifest: CoverManifest | null, phone: boolean): HallCover {
  const entry = game.slug ? manifest?.entries[game.slug] : undefined;
  const fallbackUrl = game.image ?? '';
  if (entry && entry.source === game.image) return { ...entry.widths[phone ? '320' : '640'], fallbackUrl,
    primary: entry.primary, secondary: entry.secondary };
  return { url: fallbackUrl, fallbackUrl, width: 837, height: Math.round(837 / CARD_ASPECT), ...STEEL_THEME };
}
