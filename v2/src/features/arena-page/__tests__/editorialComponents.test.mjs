import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('editorial observers use the page scroll root and never install scroll layout handlers', () => {
  const text = source('Editorial.tsx') + source('HeadlineWords.tsx');
  assert.match(text, /closest<HTMLElement>\('\.partner__scroll'\)/u);
  assert.match(text, /root[,:]/u);
  assert.doesNotMatch(text, /addEventListener\(['"]scroll|onScroll=|getBoundingClientRect/u);
});
test('headline preparation waits for the existing ready signal and preserves real text', () => {
  const text = source('HeadlineWords.tsx');
  assert.match(text, /if \(!ready/u);
  assert.match(text, /splitWords\(text\)/u);
  assert.match(text, /useEffect/u);
  assert.doesNotMatch(text, /data-editorial-state=['"]pending/u);
});
test('chapter index uses native links, numbered labels, aria-current and safe page-box scrolling', () => {
  const text = source('Editorial.tsx');
  assert.match(text, /aria-current=\{current === id \? 'true'/u);
  assert.match(text, /scrollTo\(/u);
  assert.match(text, /className="editorial-index__item"/u);
  assert.match(text, /prefers-reduced-motion|reducedMotion/u);
});
test('counter exposes a stable final accessible value and cancels its animation frame', () => {
  const text = source('Editorial.tsx');
  assert.match(text, /aria-label=\{label \? `\$\{final\}/u);
  assert.match(text, /aria-hidden="true"/u);
  assert.match(text, /cancelAnimationFrame\(frame\)/u);
});
