// Run with npm run test:unit. Over a plain button or link the cursor ring becomes a small dot, so it never
// sits on top of the control's label; labelled targets (PLAY, OPEN, VIEW) keep their expanded ring.
// Why (phase 5 review): the 26 px ring is the site's pointer, and over the Client Area's Close button it
// covered the "C" of CLOSE. The owner chose to shrink it over plain controls site-wide ("改").
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../__tests__/loadTs.mjs';

const { load } = createLoader();
const { cursorState } = await load('shared/ui/cursorState.ts');

// A minimal element chain with the closest() semantics the component relies on.
function node(tag, attrs = {}, parent = null) {
  const self = {
    tag, attrs, parent, dataset: attrs['data-cursor'] === undefined ? {} : { cursor: attrs['data-cursor'] },
    matches(selector) {
      return selector.split(',').map(part => part.trim()).some(part => part === tag
        || (part === '[data-cursor]' && attrs['data-cursor'] !== undefined)
        || (part === '[role="button"]' && attrs.role === 'button'));
    },
    closest(selector) { for (let at = self; at; at = at.parent) if (at.matches(selector)) return at; return null; },
  };
  return self;
}

test('a plain control turns the ring into a dot; a labelled one keeps its label', () => {
  const page = node('main');
  assert.deepEqual(cursorState(node('button', {}, page)), { label: '', point: true });
  assert.deepEqual(cursorState(node('span', {}, node('a', {}, page))), { label: '', point: true }, 'text inside a link');
  assert.deepEqual(cursorState(node('div', { role: 'button' }, page)), { label: '', point: true });
  assert.deepEqual(cursorState(node('img', {}, node('button', { 'data-cursor': 'PLAY' }, page))), { label: 'PLAY', point: false });
  assert.deepEqual(cursorState(node('p', {}, page)), { label: '', point: false }, 'plain content keeps the ring');
  assert.deepEqual(cursorState(null), { label: '', point: false });
});
