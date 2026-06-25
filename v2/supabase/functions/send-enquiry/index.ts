// Supabase Edge Function: send-enquiry
// ---------------------------------------------------------------------------
// Public contact endpoint (deployed with verify_jwt=false — visitors have no
// login token). It stores every enquiry (so nothing is lost) and, when
// RESEND_API_KEY is configured, emails it to the studio inbox. Until Resend is
// set up it returns { emailed: false } and the site falls back to mailto.
//
// Required/optional secrets (Supabase → Edge Functions → Manage secrets):
//   RESEND_API_KEY  (optional) enables silent email; without it → emailed:false
//   TO_EMAIL        (optional) recipient; defaults to cwang@metawin.inc
//   FROM_EMAIL      (optional) sender; defaults to onboarding@resend.dev
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
//
// Deploy: this is the canonical source. Redeploy via the Supabase MCP/CLI after
// any edit — the running function is a copy of this file.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' };

/** Trim + hard length cap so a hostile payload can't bloat the table or email. */
function clip(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS });
  }

  // --- Parse + validate input (never trust the client) -----------------------
  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS }); }

  const name = clip(payload.name, 200);
  const company = clip(payload.company, 200);
  const email = clip(payload.email, 320);
  const enquiryType = clip(payload.enquiryType, 80);
  const message = clip(payload.message, 5000);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!name || !emailValid || !message) {
    return new Response(JSON.stringify({ ok: false, error: 'Name, a valid email, and a message are required.' }), { status: 422, headers: JSON_HEADERS });
  }

  // --- Send email via Resend (only if configured) ----------------------------
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('TO_EMAIL') ?? 'cwang@metawin.inc';
  const from = Deno.env.get('FROM_EMAIL') ?? 'Gladiator Studio <onboarding@resend.dev>';
  let emailed = false;
  let emailError = '';

  if (resendKey) {
    try {
      const lines = [
        `Name: ${name}`,
        company ? `Company: ${company}` : '',
        `Email: ${email}`,
        enquiryType ? `Type: ${enquiryType}` : '',
        '',
        message,
      ].filter(Boolean);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: email,
          subject: `Enquiry — ${enquiryType || 'General'} — ${company || name}`,
          text: lines.join('\n'),
          html: `<pre style="font:14px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap">${escapeHtml(lines.join('\n'))}</pre>`,
        }),
      });
      emailed = res.ok;
      if (!res.ok) emailError = `Resend ${res.status}`;
    } catch (e) {
      emailError = String(e);
    }
  }

  // --- Persist a copy (best-effort; never blocks the response) ----------------
  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await sb.from('enquiries').insert({ name, company, email, enquiry_type: enquiryType, message, emailed });
  } catch (_e) { /* table is a backstop; email path already ran */ }

  return new Response(JSON.stringify({ ok: true, emailed, emailError: emailError || undefined }), { headers: JSON_HEADERS });
});
