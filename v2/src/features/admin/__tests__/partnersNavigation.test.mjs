import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => {
  let source = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  if (process.env.PARTNER_NAV_MUTATION === 'navigation' && name === 'adminNavigation.ts') source = source.replace(" | 'partners'", '');
  if (process.env.PARTNER_NAV_MUTATION === 'hint' && name === 'ContentPanel.tsx') source = source.replace("schema.key === 'partner'", 'false');
  return source;
};

test('Partners is an admin destination and renders its panel through the guarded sidebar', () => {
  assert.match(read('adminNavigation.ts'), /'partners'/);
  const app = read('AdminApp.tsx');
  assert.match(app, /id: 'partners', label: 'Partners', icon: <Handshake/);
  assert.match(app, /tab === 'partners' && <PartnersPanel/);
  assert.match(app, /if \(hasUnsaved\(\)\)/);
});

test('the retained partner content editor explains which fields the portal displays', () => {
  const content = read('ContentPanel.tsx');
  assert.match(content, /schema.key === 'partner'/);
  assert.match(content, /only eyebrow, title, lede and contact email are shown/i);
});
