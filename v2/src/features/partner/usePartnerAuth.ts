import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { PartnerRow } from './portalTypes';

export type PartnerAuthStatus = 'unknown' | 'signedout' | 'loading' | 'partner' | 'preview' | 'noaccess' | 'error';
interface AccessState {
  readonly userId: string;
  readonly status: 'loading' | 'partner' | 'preview' | 'noaccess' | 'error';
  readonly partner: PartnerRow | null;
  readonly error: string;
}

/** Supabase errors can be plain objects, including a rejected network request. */
export function partnerError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) return error.message;
  return fallback;
}

/** Auth discovery and access reads are separate, so a restored login never flashes the sign-in form. */
export function usePartnerAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [accessAttempt, setAccessAttempt] = useState(0);
  const [access, setAccess] = useState<AccessState>({ userId: '', status: 'loading', partner: null, error: '' });
  const currentUser = useRef('');
  const userId = session?.user.id ?? '';
  currentUser.current = userId;

  useEffect(() => {
    let alive = true, authChanged = false;
    const accept = (next: Session | null) => {
      if (!alive) return;
      setSession(next); setSessionReady(true); setSessionError('');
    };
    // Keep this callback synchronous: access queries run in the separate effect below.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      authChanged = true; accept(next);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive || authChanged) return;
      if (error) throw error;
      accept(data.session);
    }).catch((error: unknown) => {
      if (alive && !authChanged) setSessionError(partnerError(error, 'Your session could not be checked. Please try again.'));
    });
    return () => { alive = false; subscription.subscription.unsubscribe(); };
  }, [sessionAttempt]);

  useEffect(() => {
    let alive = true;
    if (!sessionReady || !userId) return;
    setAccess({ userId, status: 'loading', partner: null, error: '' });
    Promise.all([
      supabase.from('partners').select('id,user_id,company,login_email,contact_email,active,created_at')
        .eq('user_id', userId).eq('active', true).maybeSingle(),
      supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ]).then(([partnerResult, adminResult]) => {
      if (!alive || currentUser.current !== userId) return;
      if (partnerResult.error) throw partnerResult.error;
      if (adminResult.error) throw adminResult.error;
      const partner = partnerResult.data as PartnerRow | null;
      setAccess({ userId, partner, error: '', status: partner ? 'partner' : adminResult.data ? 'preview' : 'noaccess' });
    }).catch((error: unknown) => {
      if (alive && currentUser.current === userId) setAccess({ userId, status: 'error', partner: null,
        error: partnerError(error, 'Partner access could not be checked. Please try again.') });
    });
    return () => { alive = false; };
  }, [userId, sessionReady, accessAttempt]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    // admin-partners bans a disabled partner's login; GoTrue then answers "User is banned".
    if (error && /banned/i.test(error.message)) throw new Error('Your partner access is paused. Please contact Gladiator Studio.');
    if (error) throw error;
    setSession(data.session); setSessionReady(true); setSessionError('');
  }, []);
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null); setSessionReady(true); setSessionError('');
    setAccess({ userId: '', status: 'loading', partner: null, error: '' });
  }, []);
  const retry = useCallback(() => {
    if (sessionError || !sessionReady) { setSessionError(''); setSessionAttempt(value => value + 1); }
    else { setAccess({ userId, status: 'loading', partner: null, error: '' }); setAccessAttempt(value => value + 1); }
  }, [sessionError, sessionReady, userId]);

  const status: PartnerAuthStatus = sessionError ? 'error' : !sessionReady ? 'unknown' : !session ? 'signedout'
    : access.userId !== userId ? 'loading' : access.status;
  return { session, status, partner: status === 'partner' ? access.partner : null, error: sessionError || access.error, signIn, signOut, retry };
}
