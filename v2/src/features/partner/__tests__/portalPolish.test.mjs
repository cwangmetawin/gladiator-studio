// Browser review of the M4 portal (2026-10-15): after signing in the page kept the
// sign-in form's scroll position, so the emblem and eyebrow sat under the top bar,
// and the account row repeated the company name that the headline already shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../PartnerPage.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../../admin/PartnersPanel.tsx', import.meta.url), 'utf8');

test('an auth switch returns the page scroll to the top before focusing the headline', () => {
  assert.match(page, /closest\('\.partner__scroll'\)\?\.scrollTo\(\{ top: 0/);
});

test('the account row names the signed-in login, not the company again', () => {
  assert.match(page, /Signed in as/);
  assert.doesNotMatch(page, /<p>\{company \|\| auth\?\.session\?\.user\.email/);
});

test('the admin partner count is singular for one account', () => {
  assert.doesNotMatch(admin, /\{partners\.length\} accounts/);
});
