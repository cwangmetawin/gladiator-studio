import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const bodyUrl = new URL('../../features/arena-page/editorialBody.css', import.meta.url);
const eager = read('features/arena-page/arenaPage.css');
const css = eager + (existsSync(bodyUrl) ? readFileSync(bodyUrl, 'utf8') : '');

test('body headings and monetary counters use solid ice rather than a gradient across wrapped lines', () => {
  const rule = css.match(/\.partner__body :is\(([^}]+)\)\s*\{([^}]+)\}/);
  assert.ok(rule, 'an explicit body ink rule prevents inherited text gradients');
  for (const selector of ['h2', 'h3', '.editorial-counter__value', '.arena-page__position-title', '.arena-page__win-amount']) {
    assert.ok(rule[1].includes(selector), `${selector} has full-strength ink`);
  }
  assert.match(rule[2], /color:\s*var\(--color-ice-50\)/);
  assert.match(rule[2], /-webkit-text-fill-color:\s*currentColor/);
  assert.match(rule[2], /background-image:\s*none/);
});

test('all in-chapter subheadings share uppercase mono kickers and revealed hairlines', () => {
  const subhead = css.match(/\.partner__body \.editorial-chapter :is\(h3, h4\)\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(subhead, /var\(--font-mono\)/);
  assert.match(subhead, /text-transform:\s*uppercase/);
  assert.match(subhead, /letter-spacing:\s*0\.22em/);
  assert.match(css, /\.editorial-chapter :is\(h3, h4\)::after\s*\{[^}]*height:\s*1px/);
  assert.match(css, /data-editorial-state='visible'[^{}]+:is\(h3, h4\)::after\s*\{[^}]*editorial-rule-in/);
});

test('desktop counter strips fit each group on one row and phone strips keep two columns', () => {
  assert.match(css, /\.editorial-stat-strip\s*\{[^}]*grid-template-columns:\s*repeat\(3,/);
  assert.match(css, /\.editorial-stat-strip:has\(> :nth-child\(4\)\)\s*\{[^}]*grid-template-columns:\s*repeat\(4,/);
  assert.match(css, /\.partner__body :is\(\.editorial-counter-strip, \.editorial-stat-strip\)\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
});

test('counter reservation and type fit small four-column cells and complete live money', () => {
  assert.match(css, /\.editorial-counter\s*\{[^}]*container-type:\s*inline-size/);
  assert.match(css, /\.editorial-counter__value\s*\{[^}]*clamp\(24px,\s*22cqw,\s*96px\)/);
  assert.match(read('features/arena-page/Editorial.tsx'), /minWidth:\s*`min\(\$\{final\.length\}ch, 100%\)`/);
  const metrics = JSON.parse(readFileSync(new URL('./sairaTitleMetrics.json', import.meta.url), 'utf8'));
  const advance = text => [...text].reduce((sum, char) => sum + metrics.advances[char] / metrics.unitsPerEm - 0.03, 0);
  for (const width of [120, 136, 163, 200, 237, 275]) {
    const font = Math.max(24, Math.min(96, width * 0.22));
    for (const text of ['99.5%', '$635.44', '$999.9K', '$999.9M']) {
      assert.ok(advance(text) * font <= width, `${text} must fit a ${width}px counter cell`);
    }
  }
});

test('hero and details share one backing plane so a later backdrop cannot shade hero copy', () => {
  for (const file of ['arena-page/ArenaPageContent.tsx', 'partner/PartnerPage.tsx', 'partner/PartnerPending.tsx']) {
    assert.match(read(`features/${file}`), /className="partner__body">\s*<section className=(?:"partner__hero"|\{`partner__hero)/);
  }
  assert.doesNotMatch(css, /\.partner__hero::before\s*\{/);
});

test('the shortened desktop hero leaves the first chapter numeral in the opening viewport', () => {
  const hero = eager.match(/\.partner__hero\s*\{([^}]+)\}/)?.[1] ?? '';
  const offset = Number(hero.match(/min-height:\s*calc\(100dvh - (\d+)px/)?.[1]);
  assert.equal(offset, 274, 'reserve an invitation to scroll without changing flight timing');
  const width = 1440, height = 900, chapterPadding = Math.min(112, Math.max(56, width * 0.07));
  const firstNumeralTop = 56 + height - offset + chapterPadding;
  assert.ok(firstNumeralTop < height - 38, 'chapter rail starts above the fixed ticker');
  assert.match(eager, /@media \(max-width: 767px\)[^]*?\.partner__hero \{[^}]*100dvh - 260px/);
});

test('body CSS is tied to the lazy Editorial module while hero timing stays eager', () => {
  assert.match(read('features/arena-page/Editorial.tsx'), /import '\.\/editorialBody\.css'/);
  for (const file of ['ArenaPageShell.tsx', 'HeadlineWords.tsx', 'pageBodyLoaders.ts']) {
    assert.doesNotMatch(read(`features/arena-page/${file}`), /import ['"][^'"]*editorialBody\.css/);
  }
  assert.doesNotMatch(eager, /\.editorial-ledger__row\s*\{/);
  assert.match(eager, /data-flight='settled'[^\n]+editorial-word-in 140ms/);
});
