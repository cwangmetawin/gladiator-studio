import { supabase } from '@/lib/supabase';

// Contact-form submissions captured by the `send-enquiry` Edge Function.
// Read/update/delete are admin-only (RLS: enquiries_admin_read / _update / _delete);
// inserts happen server-side via the function's service role. The site never
// reads this table. Replies are sent by the admin-only `reply-enquiry` function.

interface EnquiryRow {
  readonly id: number;
  readonly name: string;
  readonly company: string;
  readonly email: string;
  readonly enquiry_type: string;
  readonly message: string;
  readonly emailed: boolean;
  readonly handled: boolean;
  readonly replied_at: string | null;
  readonly created_at: string;
}

export interface Enquiry {
  readonly id: number;
  readonly name: string;
  readonly company: string;
  readonly email: string;
  readonly enquiryType: string;
  readonly message: string;
  readonly emailed: boolean;
  readonly handled: boolean;
  readonly repliedAt: string | null;
  readonly createdAt: string;
}

function rowToEnquiry(r: EnquiryRow): Enquiry {
  return {
    id: r.id,
    name: r.name ?? '',
    company: r.company ?? '',
    email: r.email ?? '',
    enquiryType: r.enquiry_type ?? '',
    message: r.message ?? '',
    emailed: r.emailed ?? false,
    handled: r.handled ?? false,
    repliedAt: r.replied_at ?? null,
    createdAt: r.created_at,
  };
}

/** Newest first; optionally limit to recent rows. Admins only — RLS rejects everyone else. */
export async function fetchEnquiries(limit?: number): Promise<Enquiry[]> {
  let query = supabase
    .from('enquiries')
    .select('*')
    .order('created_at', { ascending: false });
  if (limit !== undefined) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data as EnquiryRow[]).map(rowToEnquiry);
}

/** Counts for the dashboard and navigation badge without downloading messages. */
export async function fetchEnquiryCount(filters: { readonly handled?: boolean; readonly createdSince?: string } = {}): Promise<number> {
  let query = supabase.from('enquiries').select('id', { count: 'exact', head: true });
  if (filters.handled !== undefined) query = query.eq('handled', filters.handled);
  if (filters.createdSince) query = query.gte('created_at', filters.createdSince);
  const { count, error } = await query;
  if (error) throw error;
  if (count === null) throw new Error('Enquiry count could not be loaded.');
  return count;
}

/** Flip the handled flag and return the updated row. */
export async function setEnquiryHandled(id: number, handled: boolean): Promise<Enquiry> {
  const { data, error } = await supabase
    .from('enquiries').update({ handled }).eq('id', id).select().single();
  if (error) throw error;
  return rowToEnquiry(data as EnquiryRow);
}

export async function deleteEnquiry(id: number): Promise<void> {
  const { error } = await supabase.from('enquiries').delete().eq('id', id);
  if (error) throw error;
}

export interface ReplyResult {
  readonly repliedAt: string;
  readonly marked: boolean;
}

/** Send via `reply-enquiry`, preserving whether its handled stamp succeeded. */
export async function sendReply(id: number, subject: string, message: string): Promise<ReplyResult> {
  const { data, error } = await supabase.functions.invoke('reply-enquiry', { body: { id, subject, message } });
  if (error) {
    // functions.invoke surfaces a generic message; the real one is on the Response.
    let msg = error.message || 'Reply failed';
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { const j = await ctx.json(); if (j?.error) msg = j.error; } catch { /* keep generic */ }
    }
    throw new Error(msg);
  }
  const res = data as { ok?: boolean; repliedAt?: string; marked?: boolean; error?: string } | null;
  if (!res?.ok) throw new Error(res?.error || 'Reply failed');
  return { repliedAt: res.repliedAt ?? new Date().toISOString(), marked: res.marked !== false };
}
