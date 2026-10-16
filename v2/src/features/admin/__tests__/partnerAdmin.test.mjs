import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const ts = require('typescript');
async function loadApi(invoke, from, getUser = async () => { throw new Error('getUser must not run'); }) {
  globalThis.__partnerAdminInvoke = invoke;
  globalThis.__partnerAdminFrom = from;
  globalThis.__partnerAdminGetUser = getUser;
  let source = readFileSync(new URL('../partnerAdminApi.ts', import.meta.url), 'utf8');
  source = source.replace(/import \{ supabase \} from '[^']+';/, 'const supabase = { functions: { invoke: (...args) => globalThis.__partnerAdminInvoke(...args) }, from: (...args) => globalThis.__partnerAdminFrom(...args), auth: { getUser: (...args) => globalThis.__partnerAdminGetUser(...args) } };');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

test('account creation uses admin-partners with the explicit create contract', async () => {
  let functionName = ''; let body;
  const api = await loadApi(async (name, options) => {
    functionName = name; body = options.body;
    return { data: { ok: true, partnerId: 'p1', email: 'partner@example.com', password: 'generated' }, error: null };
  });
  const result = await api.invokePartnerAction({ action: 'create', company: 'Example', email: 'partner@example.com' });
  assert.equal(functionName, 'admin-partners');
  assert.equal(body.action, 'create');
  assert.equal(body.company, 'Example');
  assert.equal(result.password, 'generated');
});

test('reset uses the supplied partner id and accepts an omitted email', async () => {
  const api = await loadApi(async (_name, { body }) => {
    assert.equal(body.action, 'reset'); assert.equal(body.partnerId, 'p2');
    return { data: { ok: true, partnerId: 'p2', password: 'replacement' }, error: null };
  });
  assert.equal((await api.invokePartnerAction({ action: 'reset', partnerId: 'p2' })).password, 'replacement');
});

test('function HTTP errors expose the backend JSON message', async () => {
  const api = await loadApi(async () => ({ data: null, error: { message: 'non-2xx response', context: new Response(JSON.stringify({ ok: false, error: 'That email already has a login.' }), { status: 409 }) } }));
  await assert.rejects(api.invokePartnerAction({ action: 'reset', partnerId: 'p2' }), /That email already has a login\./);
});

test('an ok:false response is never mistaken for success', async () => {
  const api = await loadApi(async () => ({ data: { ok: false, error: 'Not authorized.' }, error: null }));
  await assert.rejects(api.invokePartnerAction({ action: 'reset', partnerId: 'p2' }), /Not authorized\./);
});

test('malformed successful responses do not open an empty password dialog', async () => {
  const api = await loadApi(async () => ({ data: { ok: true, partnerId: 'p2' }, error: null }));
  await assert.rejects(api.invokePartnerAction({ action: 'reset', partnerId: 'p2' }), /valid temporary password/);
});

test('account form validation follows company and email limits', async () => {
  const { validatePartnerAccount } = await loadApi(async () => ({}));
  assert.equal(validatePartnerAccount({ company: 'Example', email: 'a@b.co', contactEmail: '' }), null);
  assert.match(validatePartnerAccount({ company: 'x'.repeat(121), email: 'a@b.co', contactEmail: '' }), /120/);
  assert.match(validatePartnerAccount({ company: 'Example', email: 'bad', contactEmail: '' }), /login email/);
  assert.match(validatePartnerAccount({ company: 'Example', email: 'a@b.co', contactEmail: 'bad' }), /contact email/);
});

test('password state is cleared by the common close path and dialog offers no persistence', () => {
  let panel = readFileSync(new URL('../PartnersPanel.tsx', import.meta.url), 'utf8');
  let dialog = readFileSync(new URL('../PasswordOnceDialog.tsx', import.meta.url), 'utf8');
  if (process.env.MUTATE_PARTNER_ADMIN_GUARD === 'password-clear') panel = panel.replaceAll('setPasswordOnce(null)', 'void 0');
  if (process.env.MUTATE_PARTNER_ADMIN_GUARD === 'password-warning') dialog = dialog.replace('It will not be shown again.', '');
  assert.match(panel, /function closePassword\(\)\s*\{\s*setPasswordOnce\(null\)/);
  assert.match(panel, /useEffect\(\(\) => \(\) => \{ passwordRequest\.current \+= 1; setPasswordOnce\(null\); \}, \[\]\)/);
  assert.match(panel, /PasswordOnceDialog[\s\S]*onClose=\{closePassword\}/);
  assert.match(dialog, /It will not be shown again\./);
  assert.match(dialog, /useDialogFocus/);
  assert.match(dialog, /aria-live="polite"/);
  assert.doesNotMatch(panel + dialog, /(?:localStorage|sessionStorage|console\.log)/);
});


for (const mutation of ['password-clear', 'password-warning']) {
  test(`the show-once source guard detects removal: ${mutation}`, () => {
    const panel = readFileSync(new URL('../PartnersPanel.tsx', import.meta.url), 'utf8');
    const dialog = readFileSync(new URL('../PasswordOnceDialog.tsx', import.meta.url), 'utf8');
    const verify = (accountSource, dialogSource) => {
      assert.match(accountSource, /function closePassword\(\)\s*\{\s*setPasswordOnce\(null\)/);
      assert.match(dialogSource, /It will not be shown again\./);
    };
    verify(panel, dialog);
    assert.throws(() => verify(mutation === 'password-clear' ? panel.replaceAll('setPasswordOnce(null)', 'void 0') : panel, mutation === 'password-warning' ? dialog.replace('It will not be shown again.', '') : dialog), assert.AssertionError);
  });
}

test('transport errors remain readable when their response is not JSON', async () => {
  const api = await loadApi(async () => ({ data: null, error: { message: 'Network is unavailable.', context: new Response('upstream failure') } }));
  await assert.rejects(api.invokePartnerAction({ action: 'reset', partnerId: 'p2' }), /Network is unavailable\./);
});

test('partner changes and credential edits participate in unsaved guards', () => {
  const panel = readFileSync(new URL('../PartnersPanel.tsx', import.meta.url), 'utf8');
  const credentials = readFileSync(new URL('../PartnerCredentialsEditor.tsx', import.meta.url), 'utf8');
  const verify = (source) => assert.match(source, /if \(newDirty \|\| detailDirty \|\| credentialDirty\) setConfirm/);
  verify(panel);
  assert.throws(() => verify(panel.replace('newDirty || detailDirty || credentialDirty', 'false')), assert.AssertionError);
  assert.match(panel, /setDirty\('partner-new-account', newDirty\)/);
  assert.match(panel, /setDirty\('partner-account-details', detailDirty\)/);
  assert.match(credentials, /setDirty\(`partner-credentials:\$\{partnerId\}`, dirty\)/);
  assert.match(credentials, /if \(dirty\) setConfirm/);
  assert.match(panel, /PartnerCredentialsEditor key=\{`\$\{selected.id\}:\$\{editorVersion\}`\}/);
});


test('credential reads explicitly filter the selected partner id', async () => {
  let table = ''; let column = ''; let partner = '';
  const query = { select: () => query, eq: (key, value) => { column = key; partner = value; return query; }, order: async () => ({ data: [], error: null }) };
  const api = await loadApi(undefined, (name) => { table = name; return query; });
  assert.equal((await api.fetchPartnerCredentials('partner-a')).length, 0);
  assert.equal(table, 'partner_credentials');
  assert.equal(column, 'partner_id');
  assert.equal(partner, 'partner-a');
});

test('credential updates stay scoped to both credential and partner ids', async () => {
  const filters = []; let savedLabel = '';
  const query = {
    update: (values) => { savedLabel = values.label; return query; },
    eq: (key, value) => { filters.push(`${key}:${value}`); return query; },
    select: () => query,
    single: async () => ({ data: { id: 'credential-a' }, error: null }),
  };
  const api = await loadApi(undefined, () => query);
  await api.savePartnerCredential('partner-a', 'credential-a', { label: ' Sandbox ', sandbox_url: '', username: '', api_key: '', notes: '' });
  assert.equal(savedLabel, 'Sandbox');
  assert.equal(filters.join(','), 'id:credential-a,partner_id:partner-a');
});

test('credential deletes stay scoped to the selected partner', async () => {
  const filters = [];
  const query = { delete: () => query, eq: (key, value) => { filters.push(`${key}:${value}`); return query; }, data: null, error: null };
  const api = await loadApi(undefined, () => query);
  await api.deletePartnerCredential('partner-a', 'credential-a');
  assert.equal(filters.join(','), 'id:credential-a,partner_id:partner-a');
});


test('credential inputs defer Unicode length limits to the code-point validator', () => {
  const source = readFileSync(new URL('../PartnerCredentialsEditor.tsx', import.meta.url), 'utf8');
  const verify = (value) => assert.doesNotMatch(value, /maxLength=/);
  verify(source);
  assert.throws(() => verify(source.replace('value={draft.label}', 'maxLength={120} value={draft.label}')), assert.AssertionError);
});

let loaderModuleId = 0;
async function loadPanelLoader() {
  const states = []; const effects = []; const requests = [];
  globalThis.__partnerLoaderDependencies = {
    useState(initial) { const index = states.length; states.push(initial); return [initial, (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
    useRef: (initial) => ({ current: initial }), useId: () => 'test',
    useCallback: (callback) => callback, useMemo: (callback) => callback(),
    useEffect: (callback) => { effects.push(callback); },
    useToast: () => ({ toast() {} }), useUnsaved: () => ({ setDirty() {} }),
    fetchPartners: () => new Promise((resolve, reject) => { requests.push({ resolve, reject }); }),
  };
  let source = readFileSync(new URL('../PartnersPanel.tsx', import.meta.url), 'utf8');
  // Exercise the real component's data callbacks without constructing/rendering JSX.
  source = source.slice(0, source.lastIndexOf('  return (')) + '  return { reload, merge };\n}\n';
  source = source.replace(/^import .*;\n/gm, '');
  source = `const { useState, useRef, useId, useCallback, useMemo, useEffect, useToast, useUnsaved, fetchPartners } = globalThis.__partnerLoaderDependencies;\n${source}\n// ${loaderModuleId++}`;
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const callbacks = module.PartnersPanel();
  const cleanups = effects.map((effect) => effect()).filter((cleanup) => typeof cleanup === 'function');
  return { ...callbacks, states, requests, dispose: () => cleanups.forEach((cleanup) => cleanup()) };
}
const flushLoader = () => new Promise((resolve) => setImmediate(resolve));

test('a late initial partner list cannot replace a newer reload', async () => {
  const panel = await loadPanelLoader();
  const latest = panel.reload();
  panel.requests[1].resolve([{ id: 'p', company: 'Fresh' }]); await latest;
  panel.requests[0].resolve([{ id: 'p', company: 'Stale' }]); await flushLoader();
  assert.equal(panel.states[0][0].company, 'Fresh'); panel.dispose();
});

test('a pending partner reload cannot replace a successful metadata mutation', async () => {
  const panel = await loadPanelLoader();
  panel.requests[0].resolve([{ id: 'p', company: 'Before' }]); await flushLoader();
  const oldLoad = panel.reload();
  panel.merge({ id: 'p', company: 'Saved' });
  panel.requests[1].resolve([{ id: 'p', company: 'Before' }]); await oldLoad;
  assert.equal(panel.states[0][0].company, 'Saved'); panel.dispose();
});

test('an unmounted partner list ignores its pending response', async () => {
  const panel = await loadPanelLoader(); panel.dispose();
  panel.requests[0].resolve([{ id: 'p', company: 'Late' }]); await flushLoader();
  assert.equal(panel.states[0].length, 0);
});

test('credential selection waits for the initial list to finish loading', async () => {
  const states = [];
  globalThis.__credentialLoaderDependencies = {
    useState(initial) { const index = states.length; states.push(initial); return [initial, (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
    useRef: (initial) => ({ current: initial }), useId: () => 'test',
    useCallback: (callback) => callback, useEffect() {},
    useToast: () => ({ toast() {} }), useUnsaved: () => ({ setDirty() {} }),
  };
  let source = readFileSync(new URL('../PartnerCredentialsEditor.tsx', import.meta.url), 'utf8');
  source = source.slice(0, source.lastIndexOf('  return (')) + '  return { select };\n}\n';
  source = source.replace(/^import .*;\n/gm, '');
  source = `const { useState, useRef, useId, useCallback, useEffect, useToast, useUnsaved } = globalThis.__credentialLoaderDependencies;\n${source}`;
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const editor = module.PartnerCredentialsEditor({ partnerId: 'p', onDirtyChange() {} });
  editor.select(null);
  assert.equal(states[3], undefined);
});

test('setActive accepts a successful false state without requiring a password', async () => {
  let name = ''; let payload;
  const api = await loadApi(async (functionName, { body }) => {
    name = functionName; payload = body;
    return { data: { ok: true, partnerId: 'partner-a', active: false }, error: null };
  });
  const result = await api.setPartnerActive('partner-a', false);
  assert.equal(name, 'admin-partners');
  assert.equal(payload.action, 'setActive');
  assert.equal(payload.partnerId, 'partner-a');
  assert.equal(payload.active, false);
  assert.equal(result.active, false);
});

test('setActive surfaces backend failure text and refuses mismatched success', async () => {
  let api = await loadApi(async () => ({ data: { ok: false, error: 'Could not lift the login block; the partner is still disabled.' }, error: null }));
  await assert.rejects(api.setPartnerActive('partner-a', true), /still disabled/);
  api = await loadApi(async () => ({ data: { ok: true, partnerId: 'partner-a', active: false }, error: null }));
  await assert.rejects(api.setPartnerActive('partner-a', true), /confirm the requested partner status/);
  api = await loadApi(async () => ({ data: { ok: true, partnerId: 'partner-b', active: true }, error: null }));
  await assert.rejects(api.setPartnerActive('partner-a', true), /confirm the requested partner status/);
});

test('partner active state is changed only through the account function', () => {
  const panel = readFileSync(new URL('../PartnersPanel.tsx', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../partnerAdminApi.ts', import.meta.url), 'utf8');
  const verify = (source) => {
    assert.doesNotMatch(source, /updatePartner\([^\n]*\{\s*active\s*:/);
    assert.doesNotMatch(source, /supabase\.from\('partners'\)\.update\(\{\s*active/);
  };
  verify(panel + api);
  assert.match(panel, /await setPartnerActive\(row.id, !row.active\)/);
  assert.throws(() => verify(panel + "\nawait updatePartner(row.id, { active: false });"), assert.AssertionError);
  assert.throws(() => verify(api + "\nsupabase.from('partners').update({ active: false });"), assert.AssertionError);
});

test('setActive uses the shared HTTP JSON error parser', async () => {
  const api = await loadApi(async () => ({ data: null, error: { message: 'non-2xx response', context: new Response(JSON.stringify({ ok: false, error: 'Access is removed, but the login could not be blocked. Try again.' }), { status: 502 }) } }));
  await assert.rejects(api.setPartnerActive('partner-a', false), /Access is removed, but the login could not be blocked/);
});

test('direct partner metadata updates discard an injected active field', async () => {
  let hasActive = true; let company = '';
  const query = {
    update(values) { hasActive = 'active' in values; company = values.company; return query; },
    eq: () => query, select: () => query,
    single: async () => ({ data: { id: 'partner-a' }, error: null }),
  };
  const api = await loadApi(undefined, () => query);
  await api.updatePartner('partner-a', { company: 'Example', contact_email: 'a@example.com', active: false });
  assert.equal(hasActive, false);
  assert.equal(company, 'Example');
});

const unauthorized = async () => ({ data: null, error: { message: 'non-2xx response', context: new Response(JSON.stringify({ ok: false, error: 'Invalid or expired session.' }), { status: 401 }) } });

test('a 401 for a session GoTrue no longer has ends the admin session with a clear message', async () => {
  let checks = 0;
  const api = await loadApi(unauthorized, undefined, async () => { checks += 1; return { data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 } }; });
  await assert.rejects(api.setPartnerActive('partner-a', false), error => error instanceof api.AdminSessionEndedError && error.message === 'Your session has ended. Please sign in again.');
  assert.equal(checks, 1);
});

test('a 401 while the session is still valid, or cannot be checked, keeps the backend message', async () => {
  const checks = [
    async () => ({ data: { user: { id: 'admin-a' } }, error: null }),
    async () => ({ data: { user: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } }),
    async () => { throw new Error('offline'); },
  ];
  for (const getUser of checks) {
    const api = await loadApi(unauthorized, undefined, getUser);
    await assert.rejects(api.invokePartnerAction({ action: 'reset', partnerId: 'p2' }), error => !(error instanceof api.AdminSessionEndedError) && /Invalid or expired session\./.test(error.message));
  }
});
