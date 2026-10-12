// Supabase Edge Function: send-enquiry
// ---------------------------------------------------------------------------
// Public contact endpoint (deployed with verify_jwt=false — visitors have no
// login token). It stores accepted enquiries and, when RESEND_API_KEY is
// configured and the email budget permits, emails them to the studio inbox.
// Until Resend is set up it returns { emailed: false } and the site falls back
// to mailto.
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
  // supabase-js's functions.invoke() sends x-client-info / x-supabase-api-version
  // in addition to authorization+apikey — ALL must be allowed or the browser's
  // CORS preflight fails and the call never reaches us (form falls back to mailto).
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' };

function fail(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), { status, headers: JSON_HEADERS });
}

/** Header-bound text (the subject) must be one line: no CR/LF header injection. */
function oneLine(s: string): string {
  return s.replace(/[\r\n\t\p{Zl}\p{Zp}]+/gu, ' ').trim();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Method not allowed');

  // --- Parse + validate input (never trust the client) -----------------------
  if (Number(req.headers.get('Content-Length') ?? 0) > 20000) return fail(413, 'Payload too large');
  let payload: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 20000) return fail(413, 'Payload too large');
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(400, 'Invalid JSON');
    payload = parsed as Record<string, unknown>;
  } catch { return fail(400, 'Invalid JSON'); }

  // Hidden honeypot field: bots fill it, people don't. A hit is still stored (an
  // over-eager browser autofill must never silently lose a real lead) but is never
  // emailed and is labelled so it can be spotted and deleted in the admin inbox.
  const honeypot = typeof payload.website === 'string' && payload.website.trim().length > 0;

  const name = String(payload.name ?? '').trim();
  const company = String(payload.company ?? '').trim();
  const email = String(payload.email ?? '').trim();
  const enquiryType = String(payload.enquiryType ?? '').trim();
  const message = String(payload.message ?? '').trim();

  for (const [field, value, limit] of [
    ['name', name, 200],
    ['company', company, 200],
    ['email', email, 320],
    ['enquiryType', enquiryType, 80],
    ['message', message, 5000],
  ] as const) {
    if (value.length > limit) return fail(422, `${field} must be ${limit} characters or fewer.`);
  }

  // A single unquoted address; reject whitespace, mailto/query delimiters and
  // PostgREST's '*' pattern wildcard so sender counts match an exact address.
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && !/[?&,;%*<>"'()[\]\\]/.test(email);
  if (!name || !emailValid || !message) {
    return fail(422, 'Name, a valid email, and a message are required.');
  }

  // --- Abuse limits (count failures fail open, but are logged) ---------------
  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const now = Date.now();
  try {
    const { count, error } = await sb.from('enquiries')
      .select('id', { count: 'exact', head: true })
      // ilike is case-insensitive; escape its wildcard for an exact address.
      .ilike('email', email.replace(/_/g, '\\_'))
      .gte('created_at', new Date(now - 10 * 60 * 1000).toISOString());
    if (error) console.error('send-enquiry sender count failed:', error);
    else if ((count ?? 0) >= 3) {
      return fail(429, 'Too many enquiries from this address — please wait a few minutes or email us directly.');
    }
  } catch (e) { console.error('send-enquiry sender count failed:', e); }

  let hourlyCount = 0;
  try {
    const { count, error } = await sb.from('enquiries')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(now - 60 * 60 * 1000).toISOString());
    if (error) console.error('send-enquiry hourly count failed:', error);
    else hourlyCount = count ?? 0;
  } catch (e) { console.error('send-enquiry hourly count failed:', e); }
  if (hourlyCount >= 300) {
    return fail(429, 'Too many enquiries — please try again later or email us directly.');
  }

  // --- Send email via Resend (only if configured) ----------------------------
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('TO_EMAIL') ?? 'cwang@metawin.inc';
  const from = Deno.env.get('FROM_EMAIL') ?? 'Gladiator Studio <onboarding@resend.dev>';
  let emailed = false;
  let emailError = '';

  if (resendKey && hourlyCount < 30 && !honeypot) {
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
          subject: oneLine(`Enquiry — ${enquiryType || 'General'} — ${company || name}`),
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

  // --- Persist a copy with the actual email outcome -------------------------
  let stored = false;
  let storageError = '';
  try {
    const storedType = honeypot ? `[honeypot] ${enquiryType}`.slice(0, 80) : enquiryType;
    const { error } = await sb.from('enquiries').insert({ name, company, email, enquiry_type: storedType, message, emailed });
    if (error) {
      console.error('send-enquiry insert failed:', error);
      storageError = 'Could not store the enquiry. Please email us directly.';
    } else stored = true;
  } catch (e) {
    console.error('send-enquiry insert failed:', e);
    storageError = 'Could not store the enquiry. Please email us directly.';
  }
  if (!stored && !emailed) return fail(500, storageError);

  return new Response(JSON.stringify({ ok: true, emailed, stored, emailError: emailError || undefined }), { headers: JSON_HEADERS });
});
