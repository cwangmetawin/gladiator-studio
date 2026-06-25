import { supabase } from '@/lib/supabase';
import type { Game, GameCategory } from '@/shared/types/game';

// ─── DB row (snake_case) ↔ Game (camelCase) ─────────────────────────────────

export interface GameRow {
  readonly id: number;
  readonly slug: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly image: string | null;
  readonly landscape_image: string | null;
  readonly link: string;
  readonly release_date: string | null;
  readonly category: GameCategory;
  readonly rtp: number | null;
  readonly volatility: 'HIGH' | 'ULTRA' | null;
  readonly genre: string | null;
  readonly is_hot: boolean;
  readonly sort_order: number;
  readonly is_published: boolean;
}

/** Admin-facing game shape: the public Game plus the DB-only management fields. */
export interface AdminGame extends Game {
  readonly sortOrder: number;
  readonly isPublished: boolean;
}

export function rowToAdminGame(r: GameRow): AdminGame {
  return {
    id: r.id,
    slug: r.slug ?? undefined,
    title: r.title,
    description: r.description ?? '',
    image: r.image ?? undefined,
    landscapeImage: r.landscape_image ?? undefined,
    link: r.link,
    timeline: r.release_date ?? '',
    category: r.category,
    rtp: r.rtp ?? undefined,
    volatility: r.volatility ?? undefined,
    genre: r.genre ?? undefined,
    isHot: r.is_hot,
    sortOrder: r.sort_order,
    isPublished: r.is_published,
  };
}

/** Build a DB row for insert/update (id omitted lets the DB assign one). */
export function adminGameToRow(g: AdminGame): Record<string, unknown> {
  return {
    ...(g.id ? { id: g.id } : {}),
    slug: g.slug || null,
    title: g.title,
    description: g.description || '',
    image: g.image || null,
    landscape_image: g.landscapeImage || null,
    link: g.link || '',
    release_date: g.timeline || null,
    category: g.category,
    rtp: g.rtp ?? null,
    volatility: g.volatility || null,
    genre: g.genre || null,
    is_hot: g.isHot ?? false,
    sort_order: g.sortOrder ?? 0,
    is_published: g.isPublished ?? true,
  };
}

// ─── Public read (anon, published only) ─────────────────────────────────────

/** Read the published catalogue, split by category. Null when empty/unavailable. */
export async function fetchCatalogueFromDb(): Promise<{ slotGames: Game[]; miniGames: Game[] } | null> {
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('release_date', { ascending: false, nullsFirst: false });
    if (error) throw error;
    if (!data || data.length === 0) return null;
    const games = (data as GameRow[]).map(rowToAdminGame);
    return {
      slotGames: games.filter((g) => g.category === 'slot'),
      miniGames: games.filter((g) => g.category === 'mini'),
    };
  } catch (err) {
    console.warn('[catalogueDb] read failed — falling back:', err);
    return null;
  }
}

// ─── Admin writes (require an authenticated admin via RLS) ───────────────────

/** All games incl. unpublished — admins only (RLS enforces). */
export async function fetchAllGames(): Promise<AdminGame[]> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('release_date', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data as GameRow[]).map(rowToAdminGame);
}

export async function saveGame(game: AdminGame): Promise<AdminGame> {
  const row = adminGameToRow(game);
  const { data, error } = await supabase.from('games').upsert(row).select().single();
  if (error) throw error;
  return rowToAdminGame(data as GameRow);
}

export async function deleteGame(id: number): Promise<void> {
  const { error } = await supabase.from('games').delete().eq('id', id);
  if (error) throw error;
}

/** Seed the table from the curated arrays (idempotent upsert by id). */
export async function importCuratedGames(curated: readonly Game[]): Promise<number> {
  const rows = curated.map((g, i) =>
    adminGameToRow({ ...g, sortOrder: i, isPublished: true } as AdminGame),
  );
  const { error } = await supabase.from('games').upsert(rows);
  if (error) throw error;
  return rows.length;
}
