import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLoader } from './loadTs.mjs';

const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;

function fixture(source) {
  const dir = mkdtempSync(join(tmpdir(), 'editorial-loader-css-'));
  writeFileSync(join(dir, 'component.css'), '.editorial-chapter { color: white; }');
  const file = join(dir, 'subject.ts');
  writeFileSync(file, source);
  return { file, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

test('the source loader accepts stylesheet side effects within lazy page modules', async () => {
  const f = fixture("import './component.css'; export const loaded = true;");
  try {
    const result = await createLoader().load(f.file);
    assert.equal(result.loaded, true);
  } finally { f.dispose(); }
});

test('an explicit stylesheet stub takes priority over the loader default', async () => {
  const f = fixture("import { source } from './component.css'; export { source };");
  try {
    const result = await createLoader({ './component.css': data("export const source = 'explicit override';") }).load(f.file);
    assert.equal(result.source, 'explicit override');
  } finally { f.dispose(); }
});
