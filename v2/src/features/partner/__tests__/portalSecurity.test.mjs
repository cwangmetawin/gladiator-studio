import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? entry.name === '__tests__' ? [] : sources(path)
      : /\.[cm]?[jt]sx?$/.test(entry.name) ? [{ path: relative(root, path), text: readFileSync(path, 'utf8') }] : [];
  });
}
const files = sources(root);
const portal = files.filter(file => file.path.startsWith('features/partner/'));
const get = name => files.find(file => file.path.endsWith(name));
const mutation = process.env.PORTAL_GUARD_MUTATION;
if (mutation === 'html') portal[0].text += '\nnode.dangerouslySetInnerHTML = { __html: body };';
if (mutation === 'public') portal[0].text += "\nsupabase.storage.from('partner-files').getPublicUrl(path);";
if (mutation === 'expiry') { const f = get('portalHelpers.ts'); if (f) f.text = f.text.replace(/SIGNED_URL_SECONDS\s*=\s*\d+/, 'SIGNED_URL_SECONDS = 601'); }
if (mutation === 'scope') {
  for (const f of portal) f.text = f.text.replace(/\.eq\(\s*['"]partner_id['"]\s*,\s*[^)]+\)/g, '');
}
if (mutation === 'invoke') portal[0].text += "\nsupabase.functions.invoke('admin-partners', { body: {} });";
if (mutation === 'lazy') { const f = get('app/App.tsx'); if (f) f.text = f.text.replace('lazy(pageBodyLoaders.partner)', 'pageBodyLoaders.partner'); }
if (mutation === 'signup') portal[0].text += '\nsupabase.auth.signUp({ email, password });';

test('portal docs never render editable content as HTML', () => {
  assert.ok(portal.length > 0);
  for (const f of portal) assert.equal(/dangerouslySetInnerHTML/.test(f.text), false, f.path);
});

test('private partner files never use public URLs', () => {
  const privateFiles = files.filter(f => f.path.startsWith('features/partner/') || /features\/admin\/(?:Partner|partner)/.test(f.path));
  for (const f of privateFiles) assert.equal(/getPublicUrl\s*\(/.test(f.text), false, f.path);
});

test('every partner download signs on demand with an expiry no greater than 600 seconds', () => {
  const helpers = get('portalHelpers.ts')?.text ?? '';
  const seconds = Number(helpers.match(/SIGNED_URL_SECONDS\s*=\s*(\d+)/)?.[1]);
  assert.ok(Number.isFinite(seconds) && seconds > 0 && seconds <= 600, 'expiry is bounded');
  const storage = get('portalStorage.ts')?.text ?? '';
  const calls = [...storage.matchAll(/\.createSignedUrl\(\s*[^,]+,\s*([^,]+),\s*\{\s*download:\s*[^}]+\}/g)];
  assert.ok(calls.length > 0, 'download filename and expiry are passed to the private bucket');
  for (const call of calls) assert.ok(call[1].trim() === 'SIGNED_URL_SECONDS' || (/^\d+$/.test(call[1].trim()) && Number(call[1]) <= 600));
  assert.equal(/getPublicUrl\s*\(/.test(storage), false);
});

test('portal credentials queries explicitly filter by the signed-in partner id', () => {
  const queries = portal.flatMap(f => [...f.text.matchAll(/\.from\(['"]partner_credentials['"]\)([^;]*?)(?:;|\n\s*return)/g)]);
  assert.ok(queries.length > 0, 'own credentials query exists');
  for (const query of queries) assert.match(query[1], /\.eq\(\s*['"]partner_id['"]\s*,\s*partner(?:\.id|Id)\s*\)/);
});

test('account provisioning is invoked exclusively from the admin feature', () => {
  const invocations = files.filter(f => /functions\s*\.\s*invoke\(\s*['"]admin-partners['"]/.test(f.text));
  assert.ok(invocations.length > 0, 'provisioning API is implemented');
  for (const f of invocations) assert.ok(f.path.startsWith('features/admin/'), f.path);
});

test('there is no frontend sign-up call anywhere in src', () => {
  for (const f of files) assert.equal(/\.signUp\s*\(/.test(f.text), false, f.path);
});

test('legacy editorial modules are removed while the Client Area stays in its existing lazy boundary', () => {
  for (const name of ['featuredCatalogue.ts', 'partnerCatalogue.ts', 'partnerContent.ts']) assert.equal(existsSync(join(root, 'features/partner', name)), false, name);
  const app = get('app/App.tsx')?.text ?? '';
  assert.match(app, /const PartnerArea = lazy\(pageBodyLoaders.partner\)/);
  assert.match(app, /<PageBodyGate page="partner"/);
  assert.match(get('PartnerDialog.tsx')?.text ?? '', /<ArenaPageShell[^>]*page="partner"/);
  const eager = ['PartnerDialog.tsx', 'PartnerPending.tsx', 'useClientArea.ts'];
  for (const name of eager) assert.equal(/portalHelpers|portalStorage|usePartnerAuth|usePortalData|PortalSections/.test(get(name)?.text ?? ''), false, name);
});
