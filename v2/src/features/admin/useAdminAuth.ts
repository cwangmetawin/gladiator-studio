import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

export interface AdminAuthState {
  readonly session: Session | null;
  readonly isAdmin: boolean;
  readonly loading: boolean;
}

/** Tracks the Supabase session and whether the signed-in user is an admin. */
export function useAdminAuth(): AdminAuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  // Until the stored session has been read, "no user" means "not known yet" —
  // without this a signed-in admin briefly sees the login screen on every load.
  const [sessionReady, setSessionReady] = useState(false);
  const userId = session?.user.id;

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setSessionReady(true); } });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => { setSession(s); setSessionReady(true); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!sessionReady) return;
    if (!userId) { setIsAdmin(false); setLoading(false); return; }
    setLoading(true);
    // RLS lets a user read their own admins row; presence == admin.
    supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (alive) { setIsAdmin(Boolean(data)); setLoading(false); } });
    return () => { alive = false; };
  }, [userId, sessionReady]);

  return { session, isAdmin, loading };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
