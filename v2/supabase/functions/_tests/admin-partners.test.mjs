// Tests for the admin-partners Edge Function, run with Node (no Deno needed):
//   cd v2 && node --test supabase/functions/_tests/
// The real index.ts is transpiled and executed against fakes for Deno and the
// Supabase client, so these tests exercise the deployed source itself.
// Each MUTATE_* flag removes one guard from the source before running it, to
// prove the test that covers it fails without the guard (red), then passes (green):
//   MUTATE_ADMIN_GUARD   the caller's admin check
//   MUTATE_TARGET_GUARD  "never change an admin login"
//   MUTATE_LOOKUP_ERROR  "a failed target lookup refuses"
//   MUTATE_RPC_CHECK     setActive checks what the database confirmed
//   MUTATE_NONCE_SCRUB   create removes the nonce GoTrue writes back on confirm
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');

const CALLER_ID = 'caller-1';
const PARTNER_ID = '11111111-2222-4333-8444-555555555555';
const PARTNER_USER = 'partner-user-1';
const OTHER_ADMIN = 'admin-user-2';
const PASSWORD = /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{5}(-[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{5}){3}$/;

const MUTATIONS = {
  MUTATE_ADMIN_GUARD: ["if (!adminRow) return fail(403, 'Not authorized.');", ''],
  MUTATE_TARGET_GUARD: ["if (targetAdmin) throw new HttpError(403, 'Admin logins cannot be changed here.');", ''],
  MUTATE_LOOKUP_ERROR: ["if (adminErr) throw new HttpError(500, 'Could not check the login.');", ''],
  MUTATE_RPC_CHECK: ["if (data !== active) throw new HttpError(500, 'Could not update the partner.');", ''],
  MUTATE_NONCE_SCRUB: ["await sb.auth.admin.updateUserById(linkedUser, { user_metadata: { partner_nonce: null } })", 'await Promise.resolve({ error: null })'],
};

function loadHandler(state) {
  let src = readFileSync(new URL('../admin-partners/index.ts', import.meta.url), 'utf8');
  src = src.replace(/^import .*$/gm, '');
  for (const [flag, [guard, replacement]] of Object.entries(MUTATIONS)) {
    if (process.env[flag] === '1') {
      assert.ok(src.includes(guard), `mutation target not found for ${flag}`);
      src = src.replace(guard, replacement);
    }
  }
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;

  let handler;
  const Deno = {
    serve: (h) => { handler = h; },
    env: { get: (k) => ({ SUPABASE_URL: 'http://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'service' })[k] },
  };
  const from = (table) => {
    const filters = {};
    let op = 'select';
    let values = null;
    const settle = () => {
      if (op === 'delete') {
        state.log.push(['delete', table, filters]);
        if (state.cleanupThrows && table === 'partner_signup_allow') return Promise.reject(new Error('network'));
      }
      if (op === 'update') {
        state.log.push(['update', table, values]);
        return Promise.resolve({ error: state.failFlag ? { message: 'boom' } : null });
      }
      if (table === 'admin_emails') return Promise.resolve({ data: [{ email: 'Boss@Studio.test' }], error: null });
      return Promise.resolve({ data: null, error: null });
    };
    const q = {
      select: () => q,
      eq: (col, val) => { filters[col] = val; return q; },
      upsert: (v) => { state.log.push(['upsert', table, v]); return Promise.resolve({ error: null }); },
      delete: () => { op = 'delete'; return q; },
      update: (v) => { op = 'update'; values = v; return q; },
      insert: (v) => { op = 'insert'; values = v; return q; },
      single: async () => {
        state.log.push([op, table, values]);
        if (table === 'partners' && op === 'insert') {
          return state.failPartnerInsert ? { data: null, error: { message: 'boom' } } : { data: { id: PARTNER_ID }, error: null };
        }
        return { data: null, error: null };
      },
      maybeSingle: async () => {
        if (table === 'admins') {
          const id = filters.user_id;
          if (id !== CALLER_ID && state.targetAdminLookupFails) return { data: null, error: { message: 'timeout' } };
          const isAdmin = (id === CALLER_ID && state.callerIsAdmin) || id === OTHER_ADMIN;
          return { data: isAdmin ? { user_id: id } : null, error: null };
        }
        if (table === 'partners') {
          if (state.partnerLookupFails) return { data: null, error: { message: 'timeout' } };
          return { data: filters.id === PARTNER_ID ? { user_id: state.partnerUser ?? PARTNER_USER } : null, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve, reject) => settle().then(resolve, reject),
    };
    return q;
  };
  const createClient = () => ({
    auth: {
      getUser: async (jwt) => (jwt === 'valid-session'
        ? { data: { user: { id: CALLER_ID } }, error: null }
        : { data: { user: null }, error: { message: 'invalid' } }),
      admin: {
        createUser: async (args) => {
          state.log.push(['createUser', args.email, args]);
          if (state.emailTaken) return { data: { user: null }, error: { message: 'A user with this email address has already been registered' } };
          return { data: { user: { id: 'new-user-1' } }, error: null };
        },
        deleteUser: async (id) => { state.log.push(['deleteUser', id]); return { error: null }; },
        updateUserById: async (id, attrs) => {
          state.log.push(['updateUserById', id, attrs]);
          if (state.scrubThrows && attrs.user_metadata) throw new Error('network');
          return { error: (state.failBan && attrs.ban_duration) || (state.failScrub && attrs.user_metadata) ? { message: 'boom' } : null };
        },
      },
    },
    from,
    rpc: async (name, args) => {
      state.log.push(['rpc', name, args]);
      return state.rpcResult ?? { data: args.p_active, error: null };
    },
  });
  new Function('Deno', 'createClient', js)(Deno, createClient);
  return handler;
}

const post = (token, body) => new Request('http://fn.test/admin-partners', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const newState = (extra = {}) => ({ callerIsAdmin: true, log: [], ...extra });
const create = { action: 'create', company: 'Acme Gaming', email: 'Ops@Acme.test' };
const reset = { action: 'reset', partnerId: PARTNER_ID };
const disable = { action: 'setActive', partnerId: PARTNER_ID, active: false };
const enable = { action: 'setActive', partnerId: PARTNER_ID, active: true };
const AUTH_OPS = ['createUser', 'updateUserById', 'deleteUser', 'rpc'];
const touchedAuth = (state) => state.log.some(([op]) => AUTH_OPS.includes(op));
const touchedAnything = (state) => state.log.some(([op]) => [...AUTH_OPS, 'upsert', 'insert', 'update'].includes(op));
const steps = (state) => state.log.map(([op, what]) => `${op}:${typeof what === 'string' ? what : ''}`);

test('missing or forged session gets 401 and touches nothing', async () => {
  for (const token of [null, 'forged']) {
    const state = newState();
    const res = await loadHandler(state)(post(token, create));
    assert.equal(res.status, 401, `token=${token}`);
    assert.equal(touchedAnything(state), false);
  }
});

test('signed-in user who is not an admin gets 403 for every action', async () => {
  for (const body of [create, reset, disable, enable]) {
    const state = newState({ callerIsAdmin: false });
    const res = await loadHandler(state)(post('valid-session', body));
    assert.equal(res.status, 403, body.action);
    assert.equal(touchedAnything(state), false, `${body.action} must not touch anything`);
  }
});

test('create sends the stored one-time nonce, links the row and returns a strong password once', async () => {
  const state = newState();
  const res = await loadHandler(state)(post('valid-session', create));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.email, 'ops@acme.test');
  assert.equal(body.partnerId, PARTNER_ID);
  assert.match(body.password, PASSWORD);
  assert.match(body.password, /[A-Z]/);
  assert.match(body.password, /[a-z]/);
  assert.match(body.password, /[0-9]/);
  assert.deepEqual(steps(state), ['upsert:partner_signup_allow', 'createUser:ops@acme.test', 'insert:partners', 'updateUserById:new-user-1', 'delete:partner_signup_allow']);
  const permit = state.log.find(([op]) => op === 'upsert')[2];
  const createArgs = state.log.find(([op]) => op === 'createUser')[2];
  assert.match(permit.nonce, /^[0-9a-f]{64}$/);
  assert.equal(createArgs.user_metadata.partner_nonce, permit.nonce, 'the login must carry the stored nonce');
  assert.equal(createArgs.password, body.password);
  assert.equal(createArgs.email_confirm, true);
  const insert = state.log.find(([op]) => op === 'insert')[2];
  assert.equal(insert.user_id, 'new-user-1');
  assert.equal(insert.login_email, 'ops@acme.test');
  assert.equal(insert.contact_email, 'ops@acme.test');
  assert.equal(insert.created_by, CALLER_ID);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('create removes the nonce that GoTrue writes back when it confirms the email', async () => {
  // Production, 2026-10-16: the sign-up gate strips partner_nonce on INSERT, but GoTrue's
  // User.Confirm (email_confirm: true) then saves its in-memory user_metadata, nonce included.
  const state = newState();
  const res = await loadHandler(state)(post('valid-session', create));
  assert.equal(res.status, 200);
  const scrub = state.log.find(([op, , attrs]) => op === 'updateUserById' && attrs?.user_metadata);
  assert.ok(scrub, 'the nonce must be removed through the admin API after the login is linked');
  assert.equal(scrub[1], 'new-user-1');
  assert.deepEqual(scrub[2], { user_metadata: { partner_nonce: null } }, 'a null value deletes the key in GoTrue');
  const order = steps(state);
  assert.ok(order.indexOf('insert:partners') < order.indexOf('updateUserById:new-user-1'), 'scrub only after the row is linked');
});

test('a failed or throwing nonce removal does not undo a linked login', async () => {
  for (const extra of [{ failScrub: true }, { scrubThrows: true }]) {
    const state = newState(extra);
    const res = await loadHandler(state)(post('valid-session', create));
    assert.equal(res.status, 200, JSON.stringify(extra));
    assert.match((await res.json()).password, PASSWORD);
    assert.equal(state.log.some(([op]) => op === 'deleteUser'), false, 'the linked login stays');
  }
});

test('passwords and nonces never repeat', async () => {
  const passwords = new Set(), nonces = new Set();
  for (let i = 0; i < 20; i += 1) {
    const state = newState();
    passwords.add((await (await loadHandler(state)(post('valid-session', create))).json()).password);
    nonces.add(state.log.find(([op]) => op === 'upsert')[2].nonce);
  }
  assert.equal(passwords.size, 20);
  assert.equal(nonces.size, 20);
});

test('a failed partner row rolls the new login back and still clears the permit', async () => {
  const state = newState({ failPartnerInsert: true });
  const res = await loadHandler(state)(post('valid-session', create));
  assert.equal(res.status, 500);
  assert.equal((await res.json()).password, undefined);
  assert.ok(state.log.some(([op, id]) => op === 'deleteUser' && id === 'new-user-1'), 'login must be deleted');
  assert.ok(state.log.some(([op, table]) => op === 'delete' && table === 'partner_signup_allow'), 'permit must be cleared');
});

test('a failing permit cleanup does not mask a successful create', async () => {
  const state = newState({ cleanupThrows: true });
  const res = await loadHandler(state)(post('valid-session', create));
  assert.equal(res.status, 200);
  assert.match((await res.json()).password, PASSWORD);
  assert.equal(state.log.some(([op]) => op === 'deleteUser'), false, 'a linked login must not be rolled back');
});

test('an email that already has a login gets 409 and the permit is cleared', async () => {
  const state = newState({ emailTaken: true });
  const res = await loadHandler(state)(post('valid-session', create));
  assert.equal(res.status, 409);
  assert.ok(state.log.some(([op, table]) => op === 'delete' && table === 'partner_signup_allow'));
  assert.equal(state.log.some(([op]) => op === 'insert'), false);
});

test('an allow-listed admin email is refused before any permit or login exists', async () => {
  const state = newState();
  const res = await loadHandler(state)(post('valid-session', { ...create, email: 'boss@studio.TEST' }));
  assert.equal(res.status, 409);
  assert.equal(touchedAnything(state), false);
});

test('bad or wrongly typed input is rejected before anything is touched', async () => {
  const bad = [
    { ...create, company: '' },
    { ...create, company: 'x'.repeat(121) },
    { ...create, company: ['Acme'] },
    { ...create, email: 'not-an-email' },
    { ...create, email: { toString: 'x' } },
    { ...create, email: 'ops@acmé.test' },
    { ...create, email: 'ÖPS@acme.test' },
    { ...create, contactEmail: 'nope' },
    { action: 'reset', partnerId: 'not-a-uuid' },
    { action: 'reset', partnerId: [PARTNER_ID] },
    { action: 'setActive', partnerId: PARTNER_ID, active: 'false' },
    { action: 'setActive', partnerId: PARTNER_ID },
    { action: 'delete', partnerId: PARTNER_ID },
  ];
  for (const body of bad) {
    const state = newState();
    const res = await loadHandler(state)(post('valid-session', body));
    assert.equal(res.status, 422, JSON.stringify(body).slice(0, 70));
    assert.equal(touchedAnything(state), false);
  }
});

test('reset sets a new password on the partner login only', async () => {
  const state = newState();
  const res = await loadHandler(state)(post('valid-session', reset));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.password, PASSWORD);
  const update = state.log.find(([op]) => op === 'updateUserById');
  assert.equal(update[1], PARTNER_USER);
  assert.equal(update[2].password, body.password);
});

test('reset and setActive refuse a partners row that points at an admin login', async () => {
  for (const body of [reset, disable, enable]) {
    const state = newState({ partnerUser: OTHER_ADMIN });
    const res = await loadHandler(state)(post('valid-session', body));
    assert.equal(res.status, 403, `${body.action} ${body.active ?? ''}`);
    assert.equal(touchedAnything(state), false);
  }
});

test('a failed lookup of the target refuses instead of guessing', async () => {
  for (const failure of ['targetAdminLookupFails', 'partnerLookupFails']) {
    for (const body of [reset, disable]) {
      const state = newState({ partnerUser: OTHER_ADMIN, [failure]: true });
      const res = await loadHandler(state)(post('valid-session', body));
      assert.equal(res.status, 500, `${failure} ${body.action}`);
      assert.equal(touchedAnything(state), false, `${failure} ${body.action} must not touch anything`);
    }
  }
});

test('reset of an unknown partner gets 404', async () => {
  const state = newState();
  const res = await loadHandler(state)(post('valid-session', { action: 'reset', partnerId: '99999999-2222-4333-8444-555555555555' }));
  assert.equal(res.status, 404);
  assert.equal(touchedAuth(state), false);
});

test('setActive changes the flag and the login ban in one database call', async () => {
  for (const body of [disable, enable]) {
    const state = newState();
    const res = await loadHandler(state)(post('valid-session', body));
    assert.equal(res.status, 200, String(body.active));
    assert.deepEqual(await res.json(), { ok: true, partnerId: PARTNER_ID, active: body.active });
    const writes = state.log.filter(([op]) => [...AUTH_OPS, 'update'].includes(op));
    assert.equal(writes.length, 1, 'exactly one write');
    assert.equal(writes[0][0], 'rpc');
    assert.equal(writes[0][1], 'admin_set_partner_active');
    assert.equal(writes[0][2].p_partner_id, PARTNER_ID);
    assert.equal(writes[0][2].p_active, body.active);
  }
});

test('setActive reports what the database refused or did not confirm', async () => {
  const cases = [
    [{ data: null, error: { code: 'P0002', message: 'Partner not found.' } }, 404],
    [{ data: null, error: { code: '23514', message: 'admin' } }, 403],
    [{ data: null, error: { code: '57014', message: 'timeout' } }, 500],
    [{ data: true, error: null }, 500],
  ];
  for (const [rpcResult, status] of cases) {
    const res = await loadHandler(newState({ rpcResult }))(post('valid-session', disable));
    assert.equal(res.status, status, JSON.stringify(rpcResult));
    assert.equal((await res.json()).ok, false);
  }
});
