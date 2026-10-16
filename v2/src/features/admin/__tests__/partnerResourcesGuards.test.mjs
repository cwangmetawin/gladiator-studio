import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('docs editor registers unsaved state and confirms before switching or creating', () => {
  let source = read('PartnerDocsEditor.tsx');
  if (process.env.MUTATE_DOC_DIRTY === '1') {
    assert.ok(source.includes("setDirty('partner-docs', dirty)"), 'dirty guard mutation target exists');
    source = source.replace("setDirty('partner-docs', dirty)", 'void dirty');
  }
  assert.ok(/setDirty\('partner-docs', dirty\)/.test(source), 'document draft registers its dirty state');
  assert.ok(/if \(dirty\) \{ setPendingSelection\(next\); return; \}/.test(source), 'dirty draft blocks selection changes');
  assert.ok(/requestSelection\(\{ kind: 'new' \}\)/.test(source), 'new document action passes through selection guard');
  assert.ok(/requestSelection\(\{ kind: 'existing', doc \}\)/.test(source), 'existing document action passes through selection guard');
  assert.ok(/title="Unsaved changes"/.test(source), 'discard uses a confirmation dialog');
  assert.ok(/validatePartnerDoc\(draft\)/.test(source), 'save validates the document draft');
});

test('files uploads are private, validated and never overwrite existing objects', () => {
  let source = read('PartnerFilesPanel.tsx');
  if (process.env.MUTATE_PARTNER_UPSERT === '1') {
    assert.ok(source.includes('upsert: false'), 'upsert mutation target exists');
    source = source.replace('upsert: false', 'upsert: true');
  }
  assert.ok(/validateUpload\(file\)/.test(source), 'upload validates file MIME, name and size');
  assert.ok(/buildStoragePath\(folder, slug, file.name\)/.test(source), 'upload path uses the shared validator');
  assert.ok(/from\(PARTNER_BUCKET\)\.upload\(path, file, \{ upsert: false/.test(source), 'private upload never overwrites an object');
  assert.ok(!/getPublicUrl|uploadImage/.test(source), 'private files avoid the public image API');
  assert.ok(/title="Delete file"/.test(source), 'delete uses a confirmation dialog');
});
