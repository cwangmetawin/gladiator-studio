// Supabase Edge Function: admin-partners
// ---------------------------------------------------------------------------
// Admin-only partner account management for the Client Area portal. Logins are
// opened by hand from /admin; there is no public sign-up.
//   1. verify_jwt=true  — the gateway rejects anonymous/invalid tokens.
//   2. admin check       — the caller's user_id must be in public.admins.
//   3. never an admin    — reset and setActive refuse a login that belongs to an
//                          admin, and every lookup error refuses too (fail closed).
// Actions (POST JSON):
//   { action: 'create', company, email, contactEmail? }
//       → creates the login and its partners row; returns the initial password once.
//   { action: 'reset', partnerId }
//       → sets a new generated password; returns it once.
//   { action: 'setActive', partnerId, active }
//       → public.admin_set_partner_active: partners.active and the login ban
//         (auth.users.banned_until) change together in one locked transaction.
//
// Sign-up gate: private.enforce_admin_signup admits a non-admin email only when
// the insert carries the secret one-time nonce stored in public.partner_signup_allow
// for that email (sent here as user_metadata.partner_nonce, which the gate consumes
// and strips). Public sign-up cannot know the nonce.
// Secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
// ASCII only, so JavaScript and Postgres lower() always agree.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// No 0/O/1/l/I: the admin reads the password out to the partner.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const PASSWORD_GROUPS = 4;
const PASSWORD_GROUP_LENGTH = 5;
const ALLOW_TTL_MS = 5 * 60 * 1000;

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function fail(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), { status, headers: JSON_HEADERS });
}
function ok(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...body }), { headers: JSON_HEADERS });
}

/** Uniform random characters; rejection sampling keeps every character equally likely. */
function randomChars(count: number): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length);
  const out: string[] = [];
  while (out.length < count) {
    for (const b of crypto.getRandomValues(new Uint8Array(count * 2))) {
      if (b < limit && out.length < count) out.push(PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]);
    }
  }
  return out.join('');
}

/** e.g. "Kp7wQ-x3MzR-9bTfa-Hn4qE": ~117 bits, upper + lower + digit + symbol. */
function generatePassword(): string {
  for (;;) {
    const body = randomChars(PASSWORD_GROUPS * PASSWORD_GROUP_LENGTH);
    if (/[A-Z]/.test(body) && /[a-z]/.test(body) && /[0-9]/.test(body)) {
      return body.match(new RegExp(`.{${PASSWORD_GROUP_LENGTH}}`, 'g'))!.join('-');
    }
  }
}

function randomNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new HttpError(422, `${field} must be text.`);
  const clean = value.replace(/[\r\n\t\p{Zl}\p{Zp}]+/gu, ' ').trim();
  if (!clean || clean.length > max) throw new HttpError(422, `${field} is required (${max} characters or fewer).`);
  return clean;
}

function email(value: unknown, field: string): string {
  const clean = text(value, field, 254).toLowerCase();
  if (!EMAIL_RE.test(clean)) throw new HttpError(422, `${field} must be a valid email address.`);
  return clean;
}

function partnerIdOf(payload: Record<string, unknown>): string {
  const id = payload.partnerId;
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new HttpError(422, 'A partner id is required.');
  return id;
}

type Sb = ReturnType<typeof createClient>;

/** The partner's login, refusing on any lookup error and on an admin login. */
async function partnerLogin(sb: Sb, partnerId: string): Promise<string> {
  const { data: partner, error } = await sb.from('partners').select('user_id').eq('id', partnerId).maybeSingle();
  if (error) throw new HttpError(500, 'Could not look up the partner.');
  if (!partner?.user_id) throw new HttpError(404, 'Partner not found.');
  const { data: targetAdmin, error: adminErr } = await sb.from('admins').select('user_id').eq('user_id', partner.user_id).maybeSingle();
  if (adminErr) throw new HttpError(500, 'Could not check the login.');
  if (targetAdmin) throw new HttpError(403, 'Admin logins cannot be changed here.');
  return String(partner.user_id);
}

async function createPartner(sb: Sb, adminId: string, payload: Record<string, unknown>): Promise<Response> {
  const company = text(payload.company, 'Company name', 120);
  const login = email(payload.email, 'Login email');
  const contact = payload.contactEmail === undefined || payload.contactEmail === ''
    ? login : email(payload.contactEmail, 'Contact email');
  // Early, friendly refusal; the sign-up gate enforces the same rule with lower().
  const { data: adminEmails, error: listErr } = await sb.from('admin_emails').select('email');
  if (listErr) throw new HttpError(500, 'Could not check the email.');
  if ((adminEmails ?? []).some((r: { email: string }) => String(r.email).toLowerCase() === login)) {
    throw new HttpError(409, 'That email belongs to an admin.');
  }

  const nonce = randomNonce();
  const expiresAt = new Date(Date.now() + ALLOW_TTL_MS).toISOString();
  const { error: allowErr } = await sb.from('partner_signup_allow').upsert({ email: login, nonce, expires_at: expiresAt });
  if (allowErr) throw new HttpError(500, 'Could not prepare the login.');
  let userId: string | undefined;
  try {
    const password = generatePassword();
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: login, password, email_confirm: true, user_metadata: { partner_nonce: nonce },
    });
    userId = created?.user?.id;
    if (createErr || !userId) {
      const taken = /already|registered|exists/i.test(createErr?.message ?? '');
      throw new HttpError(taken ? 409 : 502, taken ? 'That email already has a login.' : 'Could not create the login.');
    }
    const { data: row, error: rowErr } = await sb.from('partners')
      .insert({ user_id: userId, login_email: login, company, contact_email: contact, created_by: adminId })
      .select('id').single();
    if (rowErr || !row) throw new HttpError(500, 'Could not save the partner.');
    const partnerId = row.id;
    userId = undefined; // linked: nothing to roll back
    return ok({ partnerId, email: login, password });
  } finally {
    if (userId) {
      // Roll the login back so no account exists without its partners row.
      const { error: delErr } = await sb.auth.admin.deleteUser(userId).catch((e: unknown) => ({ error: e }));
      if (delErr) console.error('admin-partners rollback failed; orphan login', userId, delErr);
    }
    // The gate consumes the permit on success; this clears it on every other path.
    const { error: cleanErr } = await sb.from('partner_signup_allow').delete().eq('email', login)
      .then((res: { error: unknown }) => res, (e: unknown) => ({ error: e }));
    if (cleanErr) console.error('admin-partners permit cleanup failed:', cleanErr);
  }
}

async function resetPassword(sb: Sb, payload: Record<string, unknown>): Promise<Response> {
  const partnerId = partnerIdOf(payload);
  const userId = await partnerLogin(sb, partnerId);
  const password = generatePassword();
  const { error } = await sb.auth.admin.updateUserById(userId, { password });
  if (error) throw new HttpError(502, 'Could not reset the password.');
  return ok({ partnerId, password });
}

async function setActive(sb: Sb, payload: Record<string, unknown>): Promise<Response> {
  const partnerId = partnerIdOf(payload);
  if (typeof payload.active !== 'boolean') throw new HttpError(422, 'active must be true or false.');
  const active = payload.active;
  await partnerLogin(sb, partnerId);
  // One locked transaction sets partners.active and the login ban together, so
  // they agree even when two admins act at once or a step fails.
  const { data, error } = await sb.rpc('admin_set_partner_active', { p_partner_id: partnerId, p_active: active });
  if (error) {
    if (error.code === 'P0002') throw new HttpError(404, 'Partner not found.');
    if (error.code === '23514') throw new HttpError(403, 'Admin logins cannot be changed here.');
    throw new HttpError(500, 'Could not update the partner.');
  }
  if (data !== active) throw new HttpError(500, 'Could not update the partner.');
  return ok({ partnerId, active });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'Method not allowed');
  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // --- 1 & 2: authenticate the caller and require admin ---------------------
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return fail(401, 'Missing session token.');
    const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
    const user = userData?.user;
    if (userErr || !user) return fail(401, 'Invalid or expired session.');
    const { data: adminRow, error: adminErr } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (adminErr) return fail(500, 'Could not check access.');
    if (!adminRow) return fail(403, 'Not authorized.');

    let payload: unknown;
    try { payload = await req.json(); }
    catch { return fail(400, 'Invalid JSON'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail(400, 'Invalid JSON');
    const body = payload as Record<string, unknown>;

    if (body.action === 'create') return await createPartner(sb, user.id, body);
    if (body.action === 'reset') return await resetPassword(sb, body);
    if (body.action === 'setActive') return await setActive(sb, body);
    return fail(422, 'Unknown action.');
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    console.error('admin-partners failed:', e);
    return fail(500, 'Something went wrong.');
  }
});
