import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const ts = require('typescript');
let source = readFileSync(new URL('../partnerDocForm.ts', import.meta.url), 'utf8');
if (process.env.MUTATE_DOC_LIMIT === '1') {
  assert.ok(source.includes('Array.from(body).length > 50_000'), 'body limit mutation target exists');
  source = source.replace('Array.from(body).length > 50_000', 'false');
}
if (process.env.MUTATE_DOC_SORT === '1') {
  assert.ok(source.includes('!Number.isInteger(sort)'), 'sort mutation target exists');
  source = source.replace('!Number.isInteger(sort)', 'false');
}
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { validatePartnerDoc } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const valid = { title: 'Integration', body: 'Plain text', sort: '0' };

test('document validation accepts exact database text limits and signed integer sort', () => {
  assert.equal(validatePartnerDoc(valid), null);
  assert.equal(validatePartnerDoc({ title: 'A'.repeat(200), body: 'B'.repeat(50_000), sort: '-2147483648' }), null);
  assert.equal(validatePartnerDoc({ ...valid, sort: '2147483647' }), null);
});

test('document title must contain text and stay within 200 characters', () => {
  assert.match(validatePartnerDoc({ ...valid, title: '   ' }), /title/i);
  assert.match(validatePartnerDoc({ ...valid, title: 'A'.repeat(201) }), /200/);
});

test('document limits count Unicode characters as PostgreSQL char_length does', () => {
  assert.equal(validatePartnerDoc({ title: '😀'.repeat(200), body: '🦊'.repeat(50_000), sort: '0' }), null);
  assert.match(validatePartnerDoc({ ...valid, title: '😀'.repeat(201) }), /200/);
  assert.match(validatePartnerDoc({ ...valid, body: '🦊'.repeat(50_001) }), /50,000/);
});

test('document body rejects text beyond 50000 characters', () => {
  assert.match(validatePartnerDoc({ ...valid, body: 'B'.repeat(50_001) }), /50,000/);
});

test('sort rejects empty, fractional, nonnumeric and overflowing values', () => {
  for (const sort of ['', ' ', '1.5', 'no', 'Infinity', '2147483648', '-2147483649']) {
    assert.match(validatePartnerDoc({ ...valid, sort }), /integer/i, `invalid sort: ${sort}`);
  }
});
