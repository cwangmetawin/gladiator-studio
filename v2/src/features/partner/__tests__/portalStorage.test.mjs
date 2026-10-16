import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const stub = `data:text/javascript,${encodeURIComponent('export const supabase = {storage: {from: (...args) => globalThis.__partnerStorageFrom(...args)}};')}`;
const { load } = createLoader({ '@/lib/supabase': stub });
const { listPartnerFiles, createPartnerDownload } = await load('features/partner/portalStorage.ts');

function installStorage(storage) {
  globalThis.__partnerStorageFrom = (bucket) => {
    assert.equal(bucket, 'partner-files');
    return storage;
  };
}

test('private file listing paginates every directory and returns metadata without signing URLs', async () => {
  const calls = [];
  const file = (name, bytes = 12) => ({ id: `id-${name}`, name, metadata: { size: bytes, mimetype: 'image/png' }, updated_at: '2026-10-15T12:00:00Z' });
  const directory = (name) => ({ id: null, name, metadata: null });
  installStorage({
    async list(prefix, options) {
      calls.push(`${prefix}:${options.offset}`);
      assert.equal(options.limit, 1000);
      if (prefix === 'assets' && options.offset === 0) {
        return { data: [directory('arena'), ...Array.from({ length: 999 }, (_, i) => file(`invalid-root-${i}.png`))], error: null };
      }
      if (prefix === 'assets' && options.offset === 1000) return { data: [directory('new-game')], error: null };
      if (prefix === 'assets/arena') return { data: [file('cover.png', 2048), directory('mobile')], error: null };
      if (prefix === 'assets/arena/mobile') return { data: [file('icon.png')], error: null };
      if (prefix === 'assets/new-game') return { data: [file('new.png')], error: null };
      throw new Error(`Unexpected prefix ${prefix}`);
    },
    createSignedUrl() { throw new Error('Listing must not sign downloads.'); },
  });
  const files = await listPartnerFiles('assets');
  assert.equal(calls.includes('assets:1000'), true);
  assert.equal(calls.includes('assets/arena/mobile:0'), true);
  assert.deepEqual(files.map((item) => item.path), ['assets/arena/cover.png', 'assets/arena/mobile/icon.png', 'assets/new-game/new.png']);
  assert.equal(files[0].name, 'cover.png');
  assert.equal(files[0].size, 2048);
  assert.equal(files[0].mimeType, 'image/png');
  assert.equal(files[0].updatedAt, '2026-10-15T12:00:00Z');
});

test('private file listing rejects invalid prefixes before accessing storage and propagates failures', async () => {
  let calls = 0;
  installStorage({ async list() { calls++; return { data: null, error: { message: 'Storage is unavailable.' } }; } });
  for (const prefix of ['', 'unknown', 'assets/', 'assets/../game', 'docs/..']) {
    await assert.rejects(listPartnerFiles(prefix), Error, prefix);
  }
  assert.equal(calls, 0);
  await assert.rejects(listPartnerFiles('docs'), /Storage is unavailable/);
  assert.equal(calls, 1);
});

test('download signs one validated file on demand for 60 seconds with its download name', async () => {
  let calls = 0;
  installStorage({
    async createSignedUrl(path, expiresIn, options) {
      calls++;
      assert.equal(path, 'docs/Integration guide.pdf');
      assert.equal(expiresIn, 60);
      assert.equal(expiresIn > 0 && expiresIn <= 600, true);
      assert.equal(options.download, 'Integration guide.pdf');
      return { data: { signedUrl: 'https://storage.example/signed/file' }, error: null };
    },
  });
  const file = { path: 'docs/Integration guide.pdf', name: 'Integration guide.pdf', size: 12, mimeType: 'application/pdf', updatedAt: '' };
  assert.equal(await createPartnerDownload(file), 'https://storage.example/signed/file');
  await assert.rejects(createPartnerDownload({ ...file, path: 'docs/../secret.txt' }), Error);
  await assert.rejects(createPartnerDownload({ ...file, name: 'other.pdf' }), Error);
  assert.equal(calls, 1);
});

test('download reports signed URL failures without returning an empty URL', async () => {
  const file = { path: 'docs/guide.pdf', name: 'guide.pdf', size: 12, mimeType: 'application/pdf', updatedAt: '' };
  installStorage({ async createSignedUrl() { return { data: null, error: { message: 'Download is unavailable.' } }; } });
  await assert.rejects(createPartnerDownload(file), /Download is unavailable/);
  installStorage({ async createSignedUrl() { return { data: null, error: null }; } });
  await assert.rejects(createPartnerDownload(file), /download/i);
});
