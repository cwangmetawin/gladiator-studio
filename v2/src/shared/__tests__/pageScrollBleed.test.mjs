// The body backdrop extends beyond the text so its feather reaches full strength
// before the first glyph. The page stage must clip that plane out of scrollable
// width, while the scroll container retains normal vertical scrolling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cssRules, editorialCss } from './editorialCssGuard.mjs';

const css = editorialCss();
const rule = selector => {
  const found = cssRules(css).find(entry => entry.selectors === selector);
  assert.ok(found, `${selector} rule not found`);
  return found.declarations;
};

test('the single body backdrop extends beyond both page gutters without per-element copy bleed', () => {
  const backdrop = cssRules(css).find(({ selectors, declarations }) => /\.partner__body::before$/.test(selectors) && /\bbackground\s*:/.test(declarations));
  assert.ok(backdrop);
  assert.match(backdrop.declarations, /inset-inline:\s*calc\(-1\s*\*\s*\(var\(--partner-pad\)\s*\+\s*var\(--page-body-outset\)\)\)/);
  assert.doesNotMatch(css, /var\(--page-copy-bleed\)/);
});

test('the page content box clips the backdrop and the scroll box still scrolls vertically', () => {
  assert.match(rule('.partner__stage'), /overflow-x:\s*clip/);
  assert.match(rule('.partner__scroll'), /overflow-y:\s*auto/);
});
