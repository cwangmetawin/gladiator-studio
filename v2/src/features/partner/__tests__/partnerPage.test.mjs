import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';
import { moduleUrl } from '../../../shared/__tests__/sourceModule.mjs';
import { createHarness, harnessHooksUrl, findAll, textOf } from '../../../shared/__tests__/hookHarness.mjs';

const require = createRequire(import.meta.url), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const content = JSON.parse(readFileSync(new URL('../../../api/partnerDefault.json', import.meta.url), 'utf8'));
const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const stubs = { 'lucide-react': pathToFileURL(require.resolve('lucide-react')).href,
  './PortalSections': data('export const PortalSections = () => null;'),
  '@/features/arena-page/usePageBodyReady': data('export const usePageBodyReady = () => true;'),
  './usePartnerAuth': data('export const partnerError = (error, fallback) => error?.message || fallback;') };
const { PartnerPage } = await createLoader(stubs).load('features/partner/PartnerPage.tsx');
const render = patch => renderToStaticMarkup(React.createElement(PartnerPage, { content, titleId: 'partner-title', ...patch }));
const auth = patch => ({ status: 'signedout', session: null, partner: null, error: '', signIn: async () => {}, signOut: async () => {}, retry() {}, ...patch });

test('signed-out portal uses only edited hero copy, steel emblem and an accessible sign-in form', () => {
  const previous = globalThis.window; globalThis.window = { location: { origin: 'https://studio.example' } };
  try {
    const markup = render();
    assert.equal(markup.match(/<h1\b/g)?.length, 1);
    assert.match(markup, /<h1[^>]+id="partner-title"[^>]+tabindex="-1"/);
    assert.match(markup, /<svg[^>]*class="partner__emblem"/);
    assert.match(markup, /id="partner-title-steel"/);
    for (const field of ['eyebrow', 'title', 'lede', 'contactEmail']) {
      const encoded = renderToStaticMarkup(React.createElement('span', null, content[field])).slice(6, -7);
      assert.ok(markup.includes(encoded), field);
    }
    assert.match(markup, /autocomplete="username"/i); assert.match(markup, /autocomplete="current-password"/i);
    assert.match(markup, /type="email"/); assert.match(markup, /type="password"/);
    assert.match(markup, /Accounts are opened by Gladiator Studio/);
    assert.doesNotMatch(markup, /Featured titles|Integration steps|Partner FAQ|Request access|Ready to add|Max RTP/);
    assert.doesNotMatch(markup, /sign.up|signup|create account/i);
    assert.doesNotMatch(render({ content: { ...content, contactEmail: '' } }), /Accounts are opened/);
    assert.doesNotMatch(render({ content: { ...content, contactEmail: 'javascript:alert(1)' } }), /href="javascript:/);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});

test('portal headings distinguish partner, admin preview, no access and retryable access errors', () => {
  assert.match(render({ auth: auth({ status: 'partner', session: { user: { id: 'a' } }, partner: { company: 'Example Partner' } }) }), /Example Partner/);
  assert.match(render({ auth: auth({ status: 'preview', session: { user: { id: 'a' } } }) }), /Admin preview/);
  assert.match(render({ auth: auth({ status: 'noaccess', session: { user: { id: 'a' } } }) }), /This login has no partner access\. If you think it should, contact us\./);
  assert.match(render({ auth: auth({ status: 'error', error: 'Network unavailable' }) }), /role="alert"[^>]*>Network unavailable/);
  assert.match(render({ auth: auth({ status: 'error', error: 'Network unavailable' }) }), />Retry</);
  assert.doesNotMatch(render({ auth: auth({ status: 'loading', session: { user: { id: 'a' } } }) }), /<form/);
});

test('sign-in is busy, surfaces errors, clears its password and focuses the next committed state heading', async () => {
  const focuses = [], calls = []; let rejectLogin;
  const { PartnerPage: HookPage } = await createLoader({ ...stubs, react: harnessHooksUrl(moduleUrl) }).load('features/partner/PartnerPage.tsx');
  const h = createHarness(HookPage, { attach: type => type === 'h1' ? { focus: () => focuses.push('heading'), closest: () => ({ scrollTo: ({ top }) => focuses.push(`scroll:${top}`) }) } : {} });
  let login = new Promise((_yes, reject) => { rejectLogin = reject; });
  const state = auth({ signIn: (...args) => { calls.push(args); return login; } });
  const props = { content: { ...content, contactEmail: '' }, titleId: 'partner-title', auth: state };
  h.mount(props);
  assert.equal(focuses.length, 0, 'the shell owns initial flight focus');
  const input = name => findAll(h.output, node => node.props?.name === name)[0];
  h.act(() => input('email').props.onChange({ target: { value: 'person@example.com' } }));
  h.act(() => input('password').props.onChange({ target: { value: 'secret-password' } }));
  const form = () => findAll(h.output, node => node.type === 'form')[0];
  const pending = form().props.onSubmit({ preventDefault() {} }); h.act(() => {});
  assert.equal(findAll(h.output, node => node.type === 'button' && node.props.type === 'submit')[0].props.disabled, true);
  rejectLogin(new Error('Invalid login credentials')); await pending; h.act(() => {});
  assert.equal(textOf(findAll(h.output, node => node.props.role === 'alert')[0]), 'Invalid login credentials');
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'person@example.com');
  login = Promise.resolve(); await form().props.onSubmit({ preventDefault() {} }); h.act(() => {});
  assert.equal(input('password').props.value, '');
  h.update({ ...props, auth: { ...state, status: 'loading', session: { user: { id: 'a' } } } });
  assert.equal(focuses.length, 0);
  h.update({ ...props, auth: { ...state, status: 'partner', session: { user: { id: 'a' } }, partner: { company: 'Example Partner' } } });
  assert.deepEqual(focuses, ['scroll:0', 'heading'], 'the page returns to the top, then focuses the headline');
  h.unmount();
});

test('sign-out keeps the open page mounted, reports failure and focuses the signed-out heading after success', async () => {
  const focuses = []; let fail = true;
  const { PartnerPage: HookPage } = await createLoader({ ...stubs, react: harnessHooksUrl(moduleUrl) }).load('features/partner/PartnerPage.tsx');
  const state = auth({ status: 'noaccess', session: { user: { id: 'a' } }, signOut: async () => { if (fail) throw new Error('Offline'); } });
  const h = createHarness(HookPage, { attach: type => type === 'h1' ? { focus: () => focuses.push('heading'), closest: () => ({ scrollTo: ({ top }) => focuses.push(`scroll:${top}`) }) } : {} });
  h.mount({ content, titleId: 'partner-title', auth: state });
  const button = () => findAll(h.output, node => node.type === 'button' && textOf(node) === 'Sign out')[0];
  await button().props.onClick(); h.act(() => {});
  assert.equal(textOf(findAll(h.output, node => node.props.role === 'alert')[0]), 'Offline');
  fail = false; await button().props.onClick(); h.act(() => {});
  h.update({ content: { ...content, contactEmail: '' }, titleId: 'partner-title', auth: auth() });
  assert.deepEqual(focuses, ['scroll:0', 'heading'], 'the page returns to the top, then focuses the headline');
  h.unmount();
});
