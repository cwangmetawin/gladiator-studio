// Exercise the real DB reader with an offline response, including its fallback boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
const moduleUrl = (src) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString('base64')}`;
const decisionUrl = moduleUrl(readFileSync(new URL('../catalogueRead.ts', import.meta.url), 'utf8'));

async function reader(response) {
  const source = readFileSync(new URL('../catalogueDb.ts', import.meta.url), 'utf8')
    .replace("import { supabase } from '@/lib/supabase';", `
      let queries = 0;
      const console = { warn() {} };
      const supabase = { from() {
        queries++;
        const query = { select() { return query; }, eq() { return query; }, order() { return query; },
          then(resolve) { return Promise.resolve(${JSON.stringify(response)}).then(resolve); } };
        return query;
      } };
      export function queryCount() { return queries; }
    `)
    .replace("from './catalogueRead'", `from '${decisionUrl}'`);
  return import(moduleUrl(source));
}

test('zero published rows produce an empty catalogue without a second count query', async () => {
  const { fetchCatalogueFromDb, queryCount } = await reader({ data: [], error: null });
  assert.deepEqual(await fetchCatalogueFromDb(), { slotGames: [], miniGames: [] });
  assert.equal(queryCount(), 1);
});

test('a DB error returns the unavailable sentinel used by the fallback', async () => {
  const { fetchCatalogueFromDb } = await reader({ data: null, error: { message: 'Read unavailable' } });
  assert.equal(await fetchCatalogueFromDb(), null);
});

test('successful published rows are partitioned without adding curated titles', async () => {
  const { fetchCatalogueFromDb } = await reader({ data: [
    { id: 1, title: 'Published slot', link: 'https://example.com/slot', category: 'slot' },
    { id: 2, title: 'Published original', link: 'https://example.com/mini', category: 'mini' },
  ], error: null });
  const catalogue = await fetchCatalogueFromDb();
  assert.deepEqual(catalogue.slotGames.map((g) => g.title), ['Published slot']);
  assert.deepEqual(catalogue.miniGames.map((g) => g.title), ['Published original']);
});
