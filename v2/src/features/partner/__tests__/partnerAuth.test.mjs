import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';
import { moduleUrl } from '../../../shared/__tests__/sourceModule.mjs';
import { createHarness, harnessHooksUrl } from '../../../shared/__tests__/hookHarness.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = async h => { for (let i = 0; i < 10; i++) await Promise.resolve(); h.act(() => {}); };
const session = id => ({ user: { id } });
const partner = { id: 'partner-a', user_id: 'user-a', company: 'Partner A', active: true };
let fixtureId = 0;

async function setup() {
  const stored = deferred(), queries = [], requests = [], signOuts = [];
  let listener, unsubscribed = 0;
  const sb = {
    auth: {
      getSession: () => stored.promise,
      onAuthStateChange: callback => { listener = callback; return { data: { subscription: { unsubscribe: () => { unsubscribed++; } } } }; },
      signInWithPassword: async () => ({ data: { session: session('user-a') }, error: null }),
      signOut: async options => { signOuts.push(options); return { error: null }; },
    },
    from(table) {
      const query = { table, filters: [] }; queries.push(query);
      return { select() { return this; }, eq(key, value) { query.filters.push(`${key}=${value}`); return this; },
        maybeSingle() { const pending = deferred(); requests.push({ table, pending }); return pending.promise; } };
    },
  };
  globalThis.__portalAuthSb = sb;
  const { load } = createLoader({ react: harnessHooksUrl(moduleUrl), '@/lib/supabase': moduleUrl(`export const supabase = globalThis.__portalAuthSb; // fixture ${fixtureId++}`) });
  const { usePartnerAuth } = await load('features/partner/usePartnerAuth.ts');
  const h = createHarness(usePartnerAuth); h.mount();
  return { h, stored, queries, requests, signOuts, emit: next => listener('SIGNED_IN', next), unsubscribed: () => unsubscribed,
    async settle(partnerRow, adminRow = null, error = null) {
      for (const request of requests.splice(0)) request.pending.resolve({ data: request.table === 'partners' ? partnerRow : adminRow, error });
      await tick(h);
    } };
}

test('unknown stored session never renders signed out; restored partner is checked against its own user id', async () => {
  const s = await setup();
  try {
    assert.equal(s.h.output.status, 'unknown');
    s.stored.resolve({ data: { session: session('user-a') }, error: null }); await tick(s.h);
    assert.equal(s.h.output.status, 'loading');
    await s.settle(partner);
    assert.equal(s.h.output.status, 'partner');
    assert.equal(s.h.output.partner.id, 'partner-a');
    assert.equal(s.queries.find(q => q.table === 'partners').filters.includes('user_id=user-a'), true);
    assert.equal(s.queries.find(q => q.table === 'partners').filters.includes('active=true'), true);
  } finally { s.h.unmount(); delete globalThis.__portalAuthSb; }
  assert.equal(s.unsubscribed(), 1);
});

test('signed out, preview and no-access states switch in place, and late access reads cannot restore a signed-out partner', async () => {
  const s = await setup();
  try {
    s.stored.resolve({ data: { session: null }, error: null }); await tick(s.h);
    assert.equal(s.h.output.status, 'signedout');
    s.h.act(() => s.emit(session('admin-a'))); await tick(s.h); await s.settle(null, { user_id: 'admin-a' });
    assert.equal(s.h.output.status, 'preview');
    s.h.act(() => s.emit(session('inactive-a'))); await tick(s.h); await s.settle(null);
    assert.equal(s.h.output.status, 'noaccess');
    s.h.act(() => s.emit(session('user-a'))); await tick(s.h);
    await s.h.output.signOut(); s.h.act(() => {});
    assert.deepEqual(s.signOuts, [{ scope: 'local' }]);
    assert.equal(s.h.output.status, 'signedout');
    await s.settle(partner);
    assert.equal(s.h.output.status, 'signedout');
  } finally { s.h.unmount(); delete globalThis.__portalAuthSb; }
});

test('access network errors are readable and retry creates a fresh check', async () => {
  const s = await setup();
  try {
    s.stored.resolve({ data: { session: session('user-a') }, error: null }); await tick(s.h);
    await s.settle(null, null, { message: 'Network unavailable' });
    assert.equal(s.h.output.status, 'error'); assert.match(s.h.output.error, /Network unavailable/);
    s.h.act(() => s.h.output.retry()); await tick(s.h);
    assert.equal(s.h.output.status, 'loading');
    await s.settle(partner);
    assert.equal(s.h.output.status, 'partner');
  } finally { s.h.unmount(); delete globalThis.__portalAuthSb; }
});

test('sign-in errors propagate, successful sign-in uses returned session and sign-out failures preserve access', async () => {
  const s = await setup();
  try {
    s.stored.resolve({ data: { session: null }, error: null }); await tick(s.h);
    globalThis.__portalAuthSb.auth.signInWithPassword = async () => ({ data: { session: null }, error: new Error('Invalid login credentials') });
    await assert.rejects(s.h.output.signIn('test@example.com', 'wrong'), /Invalid login credentials/);
    assert.equal(s.h.output.status, 'signedout');
    globalThis.__portalAuthSb.auth.signInWithPassword = async () => ({ data: { session: session('user-a') }, error: null });
    await s.h.output.signIn('test@example.com', 'password'); await tick(s.h); await s.settle(partner);
    assert.equal(s.h.output.status, 'partner');
    globalThis.__portalAuthSb.auth.signOut = async () => ({ error: new Error('Could not sign out') });
    await assert.rejects(s.h.output.signOut(), /Could not sign out/);
    assert.equal(s.h.output.status, 'partner');
  } finally { s.h.unmount(); delete globalThis.__portalAuthSb; }
});

test('an auth event wins over a slow stored-session read and a user switch hides the previous partner immediately', async () => {
  const s = await setup();
  try {
    s.h.act(() => s.emit(session('user-a'))); await tick(s.h); await s.settle(partner);
    assert.equal(s.h.output.status, 'partner');
    s.stored.resolve({ data: { session: null }, error: null }); await tick(s.h);
    assert.equal(s.h.output.status, 'partner', 'stale stored session cannot override an observed auth event');
    s.h.act(() => s.emit(session('user-b')));
    assert.equal(s.h.output.status, 'loading'); assert.equal(s.h.output.partner === null, true);
    await s.settle(null);
    assert.equal(s.h.output.status, 'noaccess');
    assert.equal(s.h.output.partner === null, true);
  } finally { s.h.unmount(); delete globalThis.__portalAuthSb; }
});

test('a rejected stored-session read exposes retry and a successful fresh read recovers', async () => {
  const s = await setup();
  try {
    s.stored.reject(new Error('Session network unavailable')); await tick(s.h);
    assert.equal(s.h.output.status, 'error'); assert.match(s.h.output.error, /Session network unavailable/);
    globalThis.__portalAuthSb.auth.getSession = async () => ({ data: { session: session('user-a') }, error: null });
    s.h.act(() => s.h.output.retry()); await tick(s.h); await s.settle(partner);
    assert.equal(s.h.output.status, 'partner');
  } finally { s.h.unmount(); delete globalThis.__portalAuthSb; }
});
