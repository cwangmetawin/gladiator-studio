// CSV export tests, run with Node (no bundler needed):
//   cd v2 && npm run test:unit
// The real enquiriesCsv.ts is transpiled and imported, so these tests exercise the shipped source.
// MUTATE_CSV_GUARD=1 removes the formula-prefix guard before running, to prove the injection
// test fails without it (red), then passes (green).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const ts = require('typescript');

async function loadCsv() {
  let src = readFileSync(new URL('../enquiriesCsv.ts', import.meta.url), 'utf8');
  if (process.env.MUTATE_CSV_GUARD === '1') {
    const guard = "/^[=+\\-@\\t\\r]/.test(value) ? `'${value}` : value";
    assert.ok(src.includes(guard), 'mutation target not found');
    src = src.replace(guard, 'value');
  }
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

const BOM = String.fromCharCode(0xfeff);
const enquiry = (over) => ({
  id: 1, name: 'Ada', company: 'Example Ltd', email: 'ada@example.com', enquiryType: 'Operator',
  message: 'Hello', emailed: true, handled: false, repliedAt: null, createdAt: '2026-10-12T10:00:00.000Z', ...over,
});
const cells = (row) => row.match(/"(?:[^"]|"")*"/g).map((c) => c.slice(1, -1).replace(/""/g, '"'));

test('cells that a spreadsheet would run as a formula are neutralised', async () => {
  const { buildEnquiriesCsv } = await loadCsv();
  const csv = buildEnquiriesCsv([enquiry({ name: '=HYPERLINK("http://evil.example","x")', company: '+1', email: '-2@x.io', message: '@SUM(A1)' })]);
  const row = cells(csv.split('\r\n')[1]);
  assert.equal(row[1], `'=HYPERLINK("http://evil.example","x")`);
  assert.equal(row[2], "'+1");
  assert.equal(row[3], "'-2@x.io");
  assert.equal(row[7], "'@SUM(A1)");
});

test('quotes and newlines stay inside one quoted cell', async () => {
  const { buildEnquiriesCsv } = await loadCsv();
  const csv = buildEnquiriesCsv([enquiry({ message: 'Line 1\nsaid "hi", then left' })]);
  assert.ok(csv.includes('"Line 1\nsaid ""hi"", then left"'));
  assert.equal(cells(csv.slice(csv.indexOf('\r\n') + 2))[7], 'Line 1\nsaid "hi", then left');
});

test('file starts with a BOM and uses CRLF records for Excel', async () => {
  const { buildEnquiriesCsv } = await loadCsv();
  const csv = buildEnquiriesCsv([enquiry({}), enquiry({ id: 2, handled: true, repliedAt: '2026-10-12T11:00:00Z' })]);
  assert.ok(csv.startsWith(`${BOM}created_at,name,company,email,type,handled,replied_at,message\r\n`));
  assert.ok(csv.endsWith('\r\n'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.length, 4); // header, two rows, trailing empty
  assert.deepEqual(cells(lines[2]).slice(5, 7), ['true', '2026-10-12T11:00:00.000Z']);
});
