import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
let page = source('PartnerPage.tsx'), sections = source('PortalSections.tsx');
let decode = readFileSync(new URL('../../arena-page/DecodedKey.tsx', import.meta.url), 'utf8');
const defaults = JSON.parse(readFileSync(new URL('../../../api/partnerDefault.json', import.meta.url), 'utf8'));
const mutation = process.env.MUTATE_PORTAL_EDITORIAL;
if (mutation === 'copy') defaults.title = 'Removed approved title';
if (mutation === 'labels') page = page.replaceAll('partner__field-label', 'removed-label');
if (mutation === 'index') sections = sections.replace('<EditorialIndex ', '<RemovedIndex ');
if (mutation === 'decode') decode = decode.replaceAll('decodeFrame(', 'removedDecode(');
if (mutation === 'ledger') sections = sections.replaceAll('partner__fileglyph', 'removed-glyph');
if (mutation === 'reduced') decode = decode.replace('!revealed || reducedMotion || ', '!revealed || ');
if (mutation === 'cancel') decode = decode.replace('cancelAnimationFrame(frame);', '');

test('the default Client Area gate uses the approved short copy', () => {
  assert.equal(defaults.eyebrow, 'Client Area');
  assert.equal(defaults.title, 'Partner console');
  assert.equal(defaults.lede, 'Docs, sandbox keys, game assets and certificates — everything your integration team needs, behind one gate.');
  assert.match(page, /Enter the console/);
  assert.match(page, /Accounts are opened by Gladiator Studio\. Need one\?/);
  assert.match(page, /This login has no partner access\. If you think it should, contact us\./);
  assert.match(page, /Admin preview — this is what an active partner sees\./);
});

test('sign-in labels remain explicit while supporting a floating-label layout', () => {
  assert.equal((page.match(/className="partner__field-label"/g) ?? []).length, 2);
  assert.match(page, /htmlFor=\{`\$\{titleId\}-email`\}/);
  assert.match(page, /htmlFor=\{`\$\{titleId\}-password`\}/);
  assert.equal((page.match(/placeholder=" "/g) ?? []).length, 2);
});

test('all four portal chapters share the arena chapter index and approved copy', () => {
  assert.match(sections, /<EditorialIndex /);
  assert.equal((sections.match(/<EditorialChapter\b/g) ?? []).length, 4);
  for (const copy of ['DOCS', 'KEYS', 'ASSETS', 'CERTIFIED', 'Integration docs', 'Sandbox keys', 'Game assets', 'Games & certificates', 'Everything you need to go live.', 'Issued to your team alone.', 'Logos, key art and marketing packs.', 'Live RTPs as published, with lab certificates.']) {
    assert.equal(sections.includes(copy), true, copy);
  }
});

test('credential decoding uses the shared exact-value helper only after reveal', () => {
  assert.match(decode, /decodeFrame\(/);
  assert.match(decode, /if \(!revealed \|\| reducedMotion/);
  assert.match(decode, /cancelAnimationFrame\(/);
  assert.match(sections, /aria-live="polite"/);
});

test('file ledgers expose type, size and stored dates alongside on-demand downloads', () => {
  assert.match(sections, /partner__fileglyph/);
  assert.match(sections, /fileSizeLabel\(file\.size\)/);
  assert.match(sections, /file\.updatedAt/);
  assert.match(sections, /partner__rtp/);
  assert.match(sections, /game\.rtp == null \? 'Not provided' : String\(game\.rtp\)/);
});

test('the shipped key animation skips hidden and reduced keys, finishes exactly and cancels on hide', async () => {
  const { createLoader } = await import('../../../shared/__tests__/loadTs.mjs');
  const { moduleUrl } = await import('../../../shared/__tests__/sourceModule.mjs');
  const { createHarness, harnessHooksUrl } = await import('../../../shared/__tests__/hookHarness.mjs');
  const preference = moduleUrl('export const useMotionPreference = () => globalThis.__portalReducedMotion === true;');
  const hooked = decode.replace("from 'react'", `from '${harnessHooksUrl(moduleUrl)}'`)
    .replace("from '@/shared/motion/useMotionPreference'", `from '${preference}'`)
    .replace("from './editorialMotion'", `from '${createLoader().urlOf('features/arena-page/editorialMotion.ts')}'`);
  const { DecodedKey } = await import(moduleUrl(hooked));
  const before = { requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  const frames = new Map(); let next = 0;
  globalThis.requestAnimationFrame = fn => { frames.set(++next, fn); return next; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.__portalReducedMotion = false;
  const node = { textContent: '' };
  const h = createHarness(DecodedKey, { attach: (_type, props) => { node.textContent = props.children; return node; } });
  try {
    h.mount({ value: 'sandbox-test-key', revealed: false, children: '••••••••' });
    assert.equal(frames.size, 0);
    h.update({ value: 'sandbox-test-key', revealed: true, children: 'sandbox-test-key' });
    assert.equal(frames.size, 1);
    assert.notEqual(node.textContent, 'sandbox-test-key');
    const [id, tick] = frames.entries().next().value;
    frames.delete(id); tick(performance.now() + 401);
    assert.equal(node.textContent, 'sandbox-test-key');
    assert.equal(frames.size, 0);
    h.update({ value: 'sandbox-test-key', revealed: false, children: '••••••••' });
    assert.equal(node.textContent, '••••••••');
    h.update({ value: 'sandbox-test-key', revealed: true, children: 'sandbox-test-key' });
    assert.equal(frames.size, 1);
    h.update({ value: 'sandbox-test-key', revealed: false, children: '••••••••' });
    assert.equal(frames.size, 0);
    assert.equal(node.textContent, '••••••••', 'hiding cannot restore the previous clear key during cleanup');
    globalThis.__portalReducedMotion = true;
    h.update({ value: 'sandbox-test-key', revealed: true, children: 'sandbox-test-key' });
    assert.equal(frames.size, 0);
    assert.equal(node.textContent, 'sandbox-test-key');
    globalThis.__portalReducedMotion = false;
    h.update({ value: 'sandbox-test-key', revealed: true, children: 'sandbox-test-key' });
    assert.equal(frames.size, 1);
    globalThis.__portalReducedMotion = true;
    h.update({ value: 'sandbox-test-key', revealed: true, children: 'sandbox-test-key' });
    assert.equal(frames.size, 0, 'changing the motion preference cancels an active decode');
    assert.equal(node.textContent, 'sandbox-test-key');
  } finally {
    h.unmount(); delete globalThis.__portalReducedMotion;
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
