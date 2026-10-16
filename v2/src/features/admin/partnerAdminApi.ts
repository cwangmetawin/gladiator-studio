import { supabase } from '@/lib/supabase';
import type { CredentialRow, PartnerRow } from '@/features/partner/portalHelpers';

export interface PartnerAccountDraft {
  readonly company: string;
  readonly email: string;
  readonly contactEmail: string;
}
export type PartnerAction =
  | { readonly action: 'create'; readonly company: string; readonly email: string; readonly contactEmail?: string }
  | { readonly action: 'reset'; readonly partnerId: string };
export interface PartnerPassword {
  readonly partnerId: string;
  readonly password: string;
  readonly email?: string;
}
export interface CredentialDraft {
  readonly label: string;
  readonly sandbox_url: string;
  readonly username: string;
  readonly api_key: string;
  readonly notes: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validatePartnerAccount(draft: PartnerAccountDraft): string | null {
  if (!draft.company.trim() || Array.from(draft.company.trim()).length > 120) return 'Company name is required (120 characters or fewer).';
  if (draft.email.trim().length > 254 || !EMAIL.test(draft.email.trim())) return 'A valid login email is required.';
  if (draft.contactEmail.trim() && (draft.contactEmail.trim().length > 254 || !EMAIL.test(draft.contactEmail.trim()))) return 'A valid contact email is required.';
  return null;
}

/** FunctionsHttpError keeps the useful backend message in its Response context. */
async function functionError(error: unknown): Promise<string> {
  const detail = error as { readonly message?: string; readonly context?: Response } | null;
  if (detail?.context && typeof detail.context.clone === 'function') {
    try {
      const body: unknown = await detail.context.clone().json();
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
    } catch { /* Fall back to the transport message if the response is not JSON. */ }
  }
  return detail?.message || 'The account request failed. Please try again.';
}

/** The admin's login session is gone (signed out elsewhere, or revoked); the console has returned to sign-in. */
export class AdminSessionEndedError extends Error {
  constructor() { super('Your session has ended. Please sign in again.'); this.name = 'AdminSessionEndedError'; }
}

/**
 * admin-partners answers 401 when GoTrue no longer knows the session, but the database still accepts the
 * same token until it expires, so the console looks signed in. Ask GoTrue: when the session is missing,
 * supabase-js removes it locally and emits SIGNED_OUT. Any other answer keeps the session.
 */
async function sessionEnded(error: unknown): Promise<boolean> {
  if ((error as { readonly context?: Response } | null)?.context?.status !== 401) return false;
  const { error: userError } = await supabase.auth.getUser().catch(() => ({ error: null }));
  if (userError?.name !== 'AuthSessionMissingError') return false;
  // With nothing stored (cleared without a broadcast) supabase-js emits no SIGNED_OUT itself; a local
  // sign-out always does. A session stored meanwhile is a newer sign-in, so it is left alone.
  const { data } = await supabase.auth.getSession();
  if (!data.session) await supabase.auth.signOut({ scope: 'local' });
  return true;
}

type PartnerActiveAction = { readonly action: 'setActive'; readonly partnerId: string; readonly active: boolean };
async function invokePartnerFunction(body: PartnerAction | PartnerActiveAction): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('admin-partners', { body });
  if (error && await sessionEnded(error)) throw new AdminSessionEndedError();
  if (error) throw new Error(await functionError(error));
  if (data?.ok !== true) throw new Error(typeof data?.error === 'string' ? data.error : 'The account request failed. Please try again.');
  return data as Record<string, unknown>;
}
export async function invokePartnerAction(body: PartnerAction): Promise<PartnerPassword> {
  const data = await invokePartnerFunction(body);
  if (typeof data.partnerId !== 'string' || typeof data.password !== 'string' || !data.password) {
    throw new Error('The server did not return a valid temporary password. Please contact support before retrying.');
  }
  return { partnerId: data.partnerId, password: data.password, ...(typeof data.email === 'string' ? { email: data.email } : {}) };
}
/** Activation also bans/unbans the login, so only the account function may do it. */
export async function setPartnerActive(partnerId: string, active: boolean): Promise<{ readonly partnerId: string; readonly active: boolean }> {
  const data = await invokePartnerFunction({ action: 'setActive', partnerId, active });
  if (data.partnerId !== partnerId || typeof data.active !== 'boolean' || data.active !== active) throw new Error('The server did not confirm the requested partner status. Please refresh and try again.');
  return { partnerId, active };
}

export async function fetchPartners(): Promise<PartnerRow[]> {
  const { data, error } = await supabase.from('partners').select('id,user_id,company,login_email,contact_email,active,created_at,created_by').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PartnerRow[];
}
export async function updatePartner(partnerId: string, patch: { readonly company: string; readonly contact_email: string }): Promise<PartnerRow> {
  const { data, error } = await supabase.from('partners').update({ company: patch.company, contact_email: patch.contact_email }).eq('id', partnerId).select('id,user_id,company,login_email,contact_email,active,created_at,created_by').single();
  if (error) throw error;
  return data as PartnerRow;
}
export async function fetchPartnerCredentials(partnerId: string): Promise<CredentialRow[]> {
  const { data, error } = await supabase.from('partner_credentials').select('*').eq('partner_id', partnerId).order('label');
  if (error) throw error;
  return (data ?? []) as CredentialRow[];
}
export async function savePartnerCredential(partnerId: string, id: string | null, draft: CredentialDraft): Promise<CredentialRow> {
  const values = { label: draft.label.trim(), sandbox_url: draft.sandbox_url.trim() || null, username: draft.username || null, api_key: draft.api_key || null, notes: draft.notes || null };
  const query = id
    ? supabase.from('partner_credentials').update(values).eq('id', id).eq('partner_id', partnerId)
    : supabase.from('partner_credentials').insert({ ...values, partner_id: partnerId });
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data as CredentialRow;
}
export async function deletePartnerCredential(partnerId: string, id: string): Promise<void> {
  const { error } = await supabase.from('partner_credentials').delete().eq('id', id).eq('partner_id', partnerId);
  if (error) throw error;
}
