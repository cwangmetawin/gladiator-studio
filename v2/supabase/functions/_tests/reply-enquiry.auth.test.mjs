// Auth guard tests for the reply-enquiry Edge Function, run with Node (no Deno needed):
//   cd v2 && node --test supabase/functions/_tests/
// The real index.ts is transpiled and executed against fakes for Deno, the Supabase
// client and fetch, so these tests exercise the deployed source itself.
// MUTATE_ADMIN_GUARD=1 removes the admin check from the source before running it, to
// prove the "non-admin → 403" test fails without the guard (red), then passes (green).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');

const USER_ID = 'user-1';
const STORED_EMAIL = 'enquirer@example.com';

function loadHandler(state) {
  let src = readFileSync(new URL('../reply-enquiry/index.ts', import.meta.url), 'utf8');
  src = src.replace(/^import .*$/gm, '');
  if (process.env.MUTATE_ADMIN_GUARD === '1') {
    const guard = "if (!adminRow) return fail(403, 'Not authorized.');";
    assert.ok(src.includes(guard), 'mutation target not found');
    src = src.replace(guard, '');
  }
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;

  let handler;
  const Deno = {
    serve: (h) => { handler = h; },
    env: { get: (k) => ({ RESEND_API_KEY: 'test-key', SUPABASE_URL: 'http://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'service' })[k] },
  };
  const query = (table) => {
    const q = {
      select: () => q, eq: () => q, update: () => { state.updates.push(table); return q; },
      maybeSingle: async () => {
        if (table === 'admins') return { data: state.isAdmin ? { user_id: USER_ID } : null, error: null };
        if (table === 'enquiries') return { data: { id: 6, name: 'Enquirer', email: STORED_EMAIL }, error: null };
        return { data: null, error: null };
      },
    };
    return q;
  };
  const createClient = () => ({
    auth: { getUser: async (jwt) => (jwt === 'valid-session'
      ? { data: { user: { id: USER_ID } }, error: null }
      : { data: { user: null }, error: { message: 'invalid' } }) },
    from: query,
  });
  const fetch = async (url, init) => { state.sent.push({ url, body: JSON.parse(init.body) }); return new Response('{}', { status: 200 }); };
  new Function('Deno', 'createClient', 'fetch', js)(Deno, createClient, fetch);
  return handler;
}

const post = (token, body) => new Request('http://fn.test/reply-enquiry', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const reply = { id: 6, subject: 'Re: your enquiry', message: 'Hello', to: 'attacker@evil.example', cc: 'x@evil.example' };

test('signed-in user who is not an admin gets 403 and no email is sent', async () => {
  const state = { isAdmin: false, sent: [], updates: [] };
  const res = await loadHandler(state)(post('valid-session', reply));
  assert.equal(res.status, 403);
  assert.equal(state.sent.length, 0, 'no email may be sent for a non-admin');
  assert.equal(state.updates.length, 0, 'no row may be stamped for a non-admin');
});

test('missing or invalid session gets 401 and no email is sent', async () => {
  for (const token of [null, 'forged']) {
    const state = { isAdmin: true, sent: [], updates: [] };
    const res = await loadHandler(state)(post(token, reply));
    assert.equal(res.status, 401, `token=${token}`);
    assert.equal(state.sent.length, 0);
  }
});

test('admin reply goes only to the stored enquirer, never to body-supplied recipients', async () => {
  const state = { isAdmin: true, sent: [], updates: [] };
  const res = await loadHandler(state)(post('valid-session', reply));
  assert.equal(res.status, 200);
  assert.equal(state.sent.length, 1);
  const mail = state.sent[0].body;
  assert.deepEqual(mail.to, [STORED_EMAIL]);
  assert.equal(mail.cc, undefined);
  assert.equal(mail.bcc, undefined);
});

test('subject is forced onto one line (no header injection)', async () => {
  const state = { isAdmin: true, sent: [], updates: [] };
  await loadHandler(state)(post('valid-session', { ...reply, subject: 'Hi\r\nBcc: spy@evil.example' }));
  assert.equal(state.sent.length, 1);
  assert.doesNotMatch(state.sent[0].body.subject, /[\r\n]/);
});
