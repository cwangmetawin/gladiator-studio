import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// PUBLIC client credentials — the publishable (anon) key is designed to ship in
// the browser; every read/write is gated by Postgres Row Level Security, so this
// is NOT a secret. The service_role key is never used in the frontend.
// Override per-environment via Vite env vars if desired.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://lejutvltkmbscpgpfzru.supabase.co';
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_tqsWOOGN3DA_VPSXcdMUqQ_vQMH3pbe';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

let sessionCheck: SupabaseClient | null = null;
/**
 * A client that stores no session, for asking GoTrue about one token. On the site client,
 * getUser() removes whatever session is stored when GoTrue answers session_not_found, even a
 * newer sign-in that landed while it waited. Its own storage key keeps supabase-js from warning
 * about a second client, and without persistence it opens no cross-tab channel.
 */
export function sessionCheckClient(): SupabaseClient {
  sessionCheck ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-session-check' },
  });
  return sessionCheck;
}
