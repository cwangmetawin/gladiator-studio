// The one-time partner password can be shown only once, so the dialog that shows
// it must not close by accident (a stray backdrop click or Escape would lose it and
// force another reset). Only its explicit "Done" button closes it.
// Also: a disabled partner's sign-in gets a readable message, not GoTrue's raw text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dialog = read('../PasswordOnceDialog.tsx');
const auth = read('../../partner/usePartnerAuth.ts');

test('the one-time password dialog ignores backdrop clicks', () => {
  assert.equal(/className="modal-bg"[^>]*onClick/.test(dialog), false, 'the backdrop must not close the dialog');
});

test('the one-time password dialog ignores Escape', () => {
  assert.equal(/onEscape:\s*onClose/.test(dialog), false, 'Escape must not close the dialog');
});

test('the dialog still closes from its Done button', () => {
  assert.match(dialog, /onClick=\{onClose\}>Done</);
});

test('a banned (disabled) partner sees a readable sign-in message', () => {
  assert.match(auth, /banned/i, 'sign-in must recognise the ban error');
  assert.match(auth, /access is paused/i);
});
