// The feathered copy shade (phase 5 M3, round 3) hangs a blurred ::after layer
// --page-copy-bleed (32 px) beyond every line of page copy. Inside the page's
// scroll box that bleed made the scrollable width 16 px wider than a phone
// screen, so every arena page could be dragged sideways. The page content box
// clips it horizontally with overflow-x: clip, which (unlike hidden) also keeps
// the bleed out of the scroll box's scrollable width.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../features/arena-page/arenaPage.css', import.meta.url), 'utf8');
const rule = (selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `${selector} rule not found`);
  return css.slice(at, css.indexOf('}', at));
};

test('the copy shade still bleeds beyond the text', () => {
  assert.match(css, /--page-copy-bleed:\s*32px/);
});

test('the page content box clips that bleed and the scroll box still scrolls vertically', () => {
  assert.match(rule('.partner__stage'), /overflow-x:\s*clip/);
  assert.match(rule('.partner__scroll'), /overflow-y:\s*auto/);
});
