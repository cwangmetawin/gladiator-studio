import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moduleUrl } from '../../../shared/__tests__/sourceModule.mjs';
import { createHarness, harnessHooksUrl } from '../../../shared/__tests__/hookHarness.mjs';

let serial = 0;
async function setup(responses = {}) {
  const key = `__portalData${++serial}`;
  const fixture = { calls: [], responses, files: {} };
  globalThis[key] = fixture;
  const hookUrl = harnessHooksUrl(moduleUrl);
  const clientUrl = moduleUrl(`
    const fixture = globalThis.${key};
    export const supabase = { from(table) {
      const call = { table, filters: [], orders: [] }; fixture.calls.push(call);
      const query = { select(value) { call.select = value; return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        order(key, options) { call.orders.push([key, options.ascending]); return query; },
        then(resolve, reject) { const response = fixture.responses[table] ?? { data: [], error: null };
          return Promise.resolve(typeof response === 'function' ? response() : response).then(resolve, reject); } };
      return query;
    } };
  `);
  const storageUrl = moduleUrl(`
    const fixture = globalThis.${key};
    export async function listPartnerFiles(prefix) {
      const response = fixture.files[prefix] ?? [];
      if (response instanceof Error) throw response;
      return response;
    }
  `);
  const src = readFileSync(new URL('../usePortalData.ts', import.meta.url), 'utf8')
    .replace("from 'react'", `from '${hookUrl}'`)
    .replace("from '@/lib/supabase'", `from '${clientUrl}'`)
    .replace("from './portalStorage'", `from '${storageUrl}'`);
  return { ...await import(moduleUrl(src)), fixture, dispose: () => { delete globalThis[key]; } };
}
const partner = { id: 'partner-own', user_id: 'user-own', active: true };
const settle = async harness => { await new Promise(resolve => setImmediate(resolve)); harness.act(() => {}); };

test('credentials query always filters the supplied own partner id and refuses an empty id', async () => {
  const data = await setup();
  try {
    await data.loadPortalCredentials(partner);
    const query = data.fixture.calls.find(call => call.table === 'partner_credentials');
    assert.equal(query.filters.some(([key, value]) => key === 'partner_id' && value === partner.id), true);
    await assert.rejects(() => data.loadPortalCredentials({ ...partner, id: '' }), /partner/i);
    assert.equal(data.fixture.calls.length, 1);
  } finally { data.dispose(); }
});

test('docs order and published game filters are applied in the actual readers, retaining the stored RTP', async () => {
  const data = await setup({ games: { data: [{ id: 2, title: 'Stored title', rtp: '96.125' }], error: null } });
  try {
    await data.loadPortalDocs();
    const games = await data.loadPortalGames();
    assert.equal(data.fixture.calls[0].orders.map(([key]) => key).join(','), 'sort,title');
    assert.equal(data.fixture.calls[1].filters.some(([key, value]) => key === 'is_published' && value === true), true);
    assert.equal(games[0].rtp, '96.125');
  } finally { data.dispose(); }
});

test('a pending docs request leaves the shell and game data available; its retry recovers independently', async () => {
  let completeDocs;
  const pending = new Promise(resolve => { completeDocs = resolve; });
  const data = await setup({ partner_docs: pending, games: { data: [{ title: 'Ready game' }], error: null } });
  const harness = createHarness(data.usePortalData);
  try {
    harness.mount({ partner, preview: false, userId: partner.user_id });
    assert.equal(harness.output.docs.loading, true);
    await settle(harness);
    assert.equal(harness.output.games.loading, false);
    assert.equal(harness.output.games.data[0].title, 'Ready game');
    completeDocs({ data: null, error: { message: 'Connection unavailable' } });
    await settle(harness);
    assert.match(harness.output.docs.error, /Connection unavailable/);
    data.fixture.responses.partner_docs = { data: [{ title: 'Recovered document' }], error: null };
    harness.act(() => harness.output.docs.retry());
    await settle(harness);
    assert.equal(harness.output.docs.error, '');
    assert.equal(harness.output.docs.data[0].title, 'Recovered document');
    assert.equal(data.fixture.calls.filter(call => call.table === 'games').length, 1);
  } finally { harness.unmount(); data.dispose(); }
});

test('admin preview and mismatched users never read credentials or retain an earlier partner key', async () => {
  const data = await setup({ partner_credentials: { data: [{ id: 'credential', api_key: 'secret' }], error: null } });
  const harness = createHarness(data.usePortalData);
  try {
    harness.mount({ partner, preview: false, userId: partner.user_id });
    await settle(harness);
    assert.equal(harness.output.credentials.data.length, 1);
    harness.update({ partner: null, preview: true, userId: 'admin' });
    assert.equal(harness.output.credentials.data.length, 0);
    await settle(harness);
    harness.update({ partner, preview: false, userId: 'someone-else' });
    await settle(harness);
    assert.equal(harness.output.credentials.data.length, 0);
    assert.equal(data.fixture.calls.filter(call => call.table === 'partner_credentials').length, 1);
  } finally { harness.unmount(); data.dispose(); }
});


test('late credential responses cannot cross a user change or an unmount', async () => {
  let completeCredentials;
  const pending = new Promise(resolve => { completeCredentials = resolve; });
  const data = await setup({ partner_credentials: pending });
  const harness = createHarness(data.usePortalData);
  try {
    harness.mount({ partner, preview: false, userId: partner.user_id });
    harness.update({ partner: null, preview: true, userId: 'admin' });
    completeCredentials({ data: [{ api_key: 'late secret' }], error: null });
    await settle(harness);
    assert.equal(harness.output.credentials.data.length, 0);
    assert.equal(harness.output.credentials.loading, false);
    harness.unmount();
    assert.equal(data.fixture.calls.filter(call => call.table === 'partner_credentials').length, 1);
  } finally { harness.unmount(); data.dispose(); }
});
