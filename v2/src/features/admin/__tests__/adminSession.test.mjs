import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';
import { moduleUrl } from '../../../shared/__tests__/sourceModule.mjs';
import { createHarness, harnessHooksUrl } from '../../../shared/__tests__/hookHarness.mjs';

const ENDED = 'Your session has ended. Please sign in again.';
const tick = async h => { for (let i = 0; i < 10; i++) await Promise.resolve(); h.act(() => {}); };
const session = id => ({ user: { id, email: `${id}@example.com` } });
let fixtureId = 0;

async function setup(stored = session('admin-a')) {
  let listener;
  const signOuts = [];
  globalThis.__adminAuthSb = {
    auth: {
      getSession: async () => ({ data: { session: stored }, error: null }),
      onAuthStateChange: callback => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      // supabase-js notifies SIGNED_OUT from inside signOut, after its own awaits.
      signOut: async options => { signOuts.push(options); await Promise.resolve(); listener('SIGNED_OUT', null); return { error: null }; },
    },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { user_id: 'admin-a' }, error: null }) }),
  };
  const { load } = createLoader({ react: harnessHooksUrl(moduleUrl), '@/lib/supabase': moduleUrl(`export const supabase = globalThis.__adminAuthSb; // fixture ${fixtureId++}`) });
  const auth = await load('features/admin/useAdminAuth.ts');
  const h = createHarness(auth.useAdminAuth); h.mount();
  await tick(h); await tick(h); // the stored session, then its admins row
  return { h, auth, signOuts, emit: async (event, next) => { listener(event, next); await tick(h); } };
}

test('a session that ends outside the console returns to sign-in with a notice, cleared by the next sign-in', async () => {
  const s = await setup();
  try {
    assert.equal(s.h.output.session.user.id, 'admin-a');
    assert.equal(s.h.output.isAdmin, true);
    assert.equal(s.h.output.notice, null);
    await s.emit('SIGNED_OUT', null);
    assert.equal(s.h.output.session, null);
    assert.equal(s.h.output.notice, ENDED);
    await s.emit('SIGNED_IN', session('admin-a'));
    assert.equal(s.h.output.notice, null);
  } finally { s.h.unmount(); delete globalThis.__adminAuthSb; }
});

test('signing out from the console, or opening it signed out, shows the plain sign-in screen', async () => {
  const s = await setup();
  try {
    await s.auth.signOut(); await tick(s.h);
    assert.equal(s.signOuts.length, 1);
    assert.equal(s.h.output.session, null);
    assert.equal(s.h.output.notice, null);
  } finally { s.h.unmount(); delete globalThis.__adminAuthSb; }
  const fresh = await setup(null);
  try {
    assert.equal(fresh.h.output.session, null);
    assert.equal(fresh.h.output.notice, null);
  } finally { fresh.h.unmount(); delete globalThis.__adminAuthSb; }
});

test('the sign-in screen shows the notice, and an ended session skips the partner list reload', () => {
  const app = readFileSync(new URL('../AdminApp.tsx', import.meta.url), 'utf8');
  assert.match(app, /if \(!session\) return <LoginScreen notice=\{notice\} \/>/);
  assert.match(app, /\{notice && !err && <div className="msg msg--info" role="status">\{notice\}<\/div>\}/);
  const panel = readFileSync(new URL('../PartnersPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /if \(!\(reason instanceof AdminSessionEndedError\)\) await reload\(\);/);
});
