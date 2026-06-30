// Supabase Edge Function: reply-enquiry
// ---------------------------------------------------------------------------
// Admin-only endpoint to reply to an enquiry FROM the studio inbox, straight
// from the admin panel (no local mail client). Hardened against abuse:
//   1. verify_jwt=true  — the gateway rejects anonymous/invalid tokens.
//   2. admin check       — a valid login is not enough; the caller's user_id
//                          must be in public.admins.
//   3. recipient pinned  — the destination email is read from the enquiry row
//                          by id, NEVER taken from the request body, so this
//                          can't be turned into an open relay to arbitrary
//                          addresses.
// On success it emails the enquirer via Resend and stamps the row
// handled=true, replied_at=now().
//
// Secrets: RESEND_API_KEY (required), FROM_EMAIL (optional sender),
//   TO_EMAIL (optional reply-to; defaults cwang@metawin.inc).
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' };

function clip(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function fail(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), { status, headers: JSON_HEADERS });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Method not allowed');

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // --- 1 & 2: authenticate the caller and require admin -----------------------
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return fail(401, 'Missing session token.');
  const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return fail(401, 'Invalid or expired session.');
  const { data: adminRow } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!adminRow) return fail(403, 'Not authorized.');

  // --- Parse input ------------------------------------------------------------
  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return fail(400, 'Invalid JSON'); }

  const id = Number(payload.id);
  const subject = clip(payload.subject, 200);
  const message = clip(payload.message, 5000);
  if (!Number.isInteger(id) || !subject || !message) {
    return fail(422, 'An enquiry id, subject and message are required.');
  }

  // --- 3: pin the recipient to the stored enquiry -----------------------------
  const { data: enq, error: enqErr } = await sb
    .from('enquiries').select('id, name, email').eq('id', id).maybeSingle();
  if (enqErr || !enq) return fail(404, 'Enquiry not found.');
  const to = String(enq.email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail(422, 'This enquiry has no valid email to reply to.');

  // --- Send via Resend --------------------------------------------------------
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return fail(503, 'Email sending is not configured.');
  const from = Deno.env.get('FROM_EMAIL') ?? 'Gladiator Studio <onboarding@resend.dev>';
  const replyTo = Deno.env.get('TO_EMAIL') ?? 'cwang@metawin.inc';

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: replyTo,
        subject,
        text: message,
        html: `<div style="font:14px/1.6 ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif;white-space:pre-wrap">${escapeHtml(message)}</div>`,
      }),
    });
  } catch (e) {
    return fail(502, `Email transport failed: ${String(e)}`);
  }
  if (!res.ok) return fail(502, `Resend rejected the email (${res.status}).`);

  // --- Stamp handled + replied_at (best-effort) -------------------------------
  const repliedAt = new Date().toISOString();
  try {
    await sb.from('enquiries').update({ handled: true, replied_at: repliedAt }).eq('id', id);
  } catch (_e) { /* email already sent; the flag is secondary */ }

  return new Response(JSON.stringify({ ok: true, sent: true, repliedAt }), { headers: JSON_HEADERS });
});
