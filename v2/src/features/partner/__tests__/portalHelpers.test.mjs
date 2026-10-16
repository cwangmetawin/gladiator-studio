import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const helpers = await load('features/partner/portalHelpers.ts');
const {
  buildStoragePath, validateStoragePath, sanitizeFileName, maskApiKey,
  docsParagraphs, fileSizeLabel, fileTypeLabel, validateCredential,
  validateUpload, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_MIME_TYPES,
} = helpers;

test('storage paths retain original safe names and distinguish docs from game folders', () => {
  assert.equal(buildStoragePath('assets', 'arena-2', 'Game kit 2026.zip'), 'assets/arena-2/Game kit 2026.zip');
  assert.equal(buildStoragePath('certificates', 'arena_2', '证书.pdf'), 'certificates/arena_2/证书.pdf');
  assert.equal(buildStoragePath('docs', '', 'Integration guide.txt'), 'docs/Integration guide.txt');
  assert.equal(validateStoragePath('assets/arena-2/mobile/icons/a.png'), true);
  assert.equal(validateStoragePath('docs/release/guide.pdf'), true);
});

test('filename and path guards reject traversal, separators, unknown roots and empty slugs', () => {
  for (const name of ['../secret.txt', 'asset..zip', 'nested/file.pdf', 'nested\\file.pdf', '', '   ']) {
    assert.throws(() => sanitizeFileName(name), Error, name);
    assert.equal(typeof validateUpload({ name, size: 1, type: 'text/plain' }), 'string', name);
  }
  assert.equal(sanitizeFileName('file\nname.txt'), 'file_name.txt');
  for (const path of ['private/guide.pdf', 'assets//guide.pdf', 'assets/arena', 'assets/arena/../x.pdf', 'docs/a..pdf', 'docs/a\\b.pdf', '/docs/a.txt', 'docs/a.txt/', 'docs//a.txt', 'docs/a\nb.txt']) {
    assert.equal(validateStoragePath(path), false, path);
  }
  assert.throws(() => buildStoragePath('assets', '', 'a.zip'), Error);
  assert.throws(() => buildStoragePath('assets', '../arena', 'a.zip'), Error);
  assert.throws(() => buildStoragePath('unknown', 'arena', 'a.zip'), Error);
});

test('API keys are masked without revealing their content or length', () => {
  assert.equal(maskApiKey('a'), maskApiKey('super-secret-key'));
  assert.equal(maskApiKey('super-secret-key').includes('secret'), false);
  assert.equal(maskApiKey('a').includes('a'), false);
  assert.equal(maskApiKey(null), 'Not set');
  assert.equal(maskApiKey(''), 'Not set');
});

test('docs split on blank lines while retaining plain text and intra-paragraph newlines', () => {
  assert.deepEqual(docsParagraphs('  First\r\nline\r\n\r\n <script>alert(1)</script> \n \n Last  '), [
    'First\nline', '<script>alert(1)</script>', 'Last',
  ]);
  assert.deepEqual(docsParagraphs(' \n\n '), []);
});

test('file labels are readable, size bounded and fall back safely', () => {
  assert.equal(fileSizeLabel(0), '0 B');
  assert.equal(fileSizeLabel(1024), '1 KB');
  assert.equal(fileSizeLabel(1536), '1.5 KB');
  assert.equal(fileSizeLabel(MAX_UPLOAD_BYTES), '50 MB');
  assert.equal(fileSizeLabel(Number.NaN), 'Size unavailable');
  assert.equal(fileSizeLabel(-1), 'Size unavailable');
  assert.equal(fileTypeLabel('certificate.PDF'), 'PDF document');
  assert.equal(fileTypeLabel('download', 'application/x-zip-compressed'), 'ZIP archive');
  assert.equal(fileTypeLabel('image.jpg'), 'JPEG image');
  assert.equal(fileTypeLabel('movie.mp4'), 'MP4 video');
  assert.equal(fileTypeLabel('data.unknown'), 'File');
});

const validCredential = {
  label: 'Sandbox', sandbox_url: 'https://sandbox.example.com/test',
  username: 'partner', api_key: 'secret', notes: 'Test account',
};

test('credential validation enforces required labels, valid HTTPS URLs and every migration length limit', () => {
  assert.equal(validateCredential(validCredential), null);
  assert.equal(validateCredential({ label: 'Sandbox', sandbox_url: '', username: '', api_key: '', notes: '' }), null);
  for (const [field, length] of [['label', 120], ['sandbox_url', 500], ['username', 200], ['api_key', 500], ['notes', 2000]]) {
    const atLimit = field === 'sandbox_url' ? `https://example.com/${'a'.repeat(length - 20)}` : '😀'.repeat(length);
    assert.equal(validateCredential({ ...validCredential, [field]: atLimit }), null, `${field} at its limit`);
    assert.equal(typeof validateCredential({ ...validCredential, [field]: `${atLimit}x` }), 'string', `${field} beyond its limit`);
  }
  for (const label of ['', '  ']) {
    assert.equal(typeof validateCredential({ ...validCredential, label }), 'string');
  }
  for (const sandbox_url of ['http://example.com', 'javascript:alert(1)', 'https://', 'https:///']) {
    assert.equal(typeof validateCredential({ ...validCredential, sandbox_url }), 'string', sandbox_url);
  }
});

test('uploads mirror the private bucket MIME allow-list and 50 MB boundary', () => {
  for (const type of ALLOWED_UPLOAD_MIME_TYPES) {
    assert.equal(validateUpload({ name: 'Download.file', size: MAX_UPLOAD_BYTES, type }), null, type);
  }
  assert.equal(typeof validateUpload({ name: 'x.zip', size: MAX_UPLOAD_BYTES + 1, type: 'application/zip' }), 'string');
  assert.equal(typeof validateUpload({ name: 'x.txt', size: -1, type: 'text/plain' }), 'string');
  assert.equal(typeof validateUpload({ name: 'x.txt', size: Number.NaN, type: 'text/plain' }), 'string');
  assert.equal(typeof validateUpload({ name: 'x.html', size: 1, type: 'text/html' }), 'string');
  assert.equal(typeof validateUpload({ name: 'x.zip', size: 1, type: '' }), 'string');
});
