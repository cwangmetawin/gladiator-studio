import type { CredentialInput, PartnerFolder } from './portalTypes';

export type { CredentialInput, CredentialRow, PartnerDocRow, PartnerFile, PartnerFolder, PartnerRow, PortalGame } from './portalTypes';

export const PARTNER_BUCKET = 'partner-files';
export const SIGNED_URL_SECONDS = 60;
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const ALLOWED_UPLOAD_MIME_TYPES: readonly string[] = [
  'application/pdf', 'application/zip', 'application/x-zip-compressed',
  'image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'text/plain',
];

const FOLDERS: readonly string[] = ['assets', 'certificates', 'docs'];
const SLUG_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i;
// Storage names may contain spaces or Unicode; only traversal and controls are unsafe.
const CONTROL_PATTERN = /\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}/gu;

export function sanitizeFileName(name: string): string {
  if (name.includes('..') || /[/\\]/u.test(name)) {
    throw new Error('Use a file name without path separators or "..".');
  }
  const sanitized = name.replace(CONTROL_PATTERN, '_');
  if (!sanitized.trim() || sanitized === '.') throw new Error('A file name is required.');
  return sanitized;
}

export function buildStoragePath(folder: PartnerFolder, slug: string, name: string): string {
  if (!FOLDERS.includes(folder)) throw new Error('Choose Assets, Certificates or Docs.');
  if (folder !== 'docs' && !SLUG_PATTERN.test(slug)) {
    throw new Error('Choose a valid game slug.');
  }
  const fileName = sanitizeFileName(name);
  return folder === 'docs' ? `${folder}/${fileName}` : `${folder}/${slug}/${fileName}`;
}

export function validateStoragePath(path: string): boolean {
  const segments = path.split('/');
  const folder = segments[0] ?? '';
  if (!FOLDERS.includes(folder) || segments.length < (folder === 'docs' ? 2 : 3)) return false;
  if (folder !== 'docs' && !SLUG_PATTERN.test(segments[1] ?? '')) return false;
  return segments.every((segment) => {
    try { return sanitizeFileName(segment) === segment; }
    catch { return false; }
  });
}

export function maskApiKey(key: string | null | undefined): string {
  return key ? '••••••••' : 'Not set';
}

/** Content stays plain text: React escapes the resulting paragraph strings. */
export function docsParagraphs(body: string): string[] {
  return body.replace(/\r\n?/g, '\n').split(/\n[\t ]*\n+/).map((part) => part.trim()).filter(Boolean);
}

export function fileSizeLabel(size: number): string {
  if (!Number.isFinite(size) || size < 0) return 'Size unavailable';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unit = size === 0 ? 0 : Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const boundedUnit = Math.max(0, unit);
  const value = size / 1024 ** boundedUnit;
  return `${Number(value.toFixed(boundedUnit === 0 ? 0 : 1))} ${units[boundedUnit]}`;
}

export function fileTypeLabel(name: string, mimeType = ''): string {
  const mimeLabels: Record<string, string> = {
    'application/pdf': 'PDF document',
    'application/zip': 'ZIP archive',
    'application/x-zip-compressed': 'ZIP archive',
    'image/png': 'PNG image',
    'image/jpeg': 'JPEG image',
    'image/webp': 'WebP image',
    'video/mp4': 'MP4 video',
    'text/plain': 'Text document',
  };
  const extensionLabels: Record<string, string> = {
    pdf: 'PDF document', zip: 'ZIP archive', png: 'PNG image',
    jpg: 'JPEG image', jpeg: 'JPEG image', webp: 'WebP image',
    mp4: 'MP4 video', txt: 'Text document',
  };
  return mimeLabels[mimeType.toLowerCase()] ?? extensionLabels[name.split('.').at(-1)?.toLowerCase() ?? ''] ?? 'File';
}

export function validateCredential(input: CredentialInput): string | null {
  // PostgreSQL char_length counts Unicode code points, unlike JavaScript .length.
  const length = (value: string) => Array.from(value).length;
  if (!input.label.trim() || length(input.label) > 120) return 'Label is required (120 characters or fewer).';
  if (length(input.sandbox_url) > 500) return 'Sandbox URL must be 500 characters or fewer.';
  if (input.sandbox_url) {
    try {
      const url = new URL(input.sandbox_url);
      if (url.protocol !== 'https:' || !url.hostname) return 'Sandbox URL must be a valid HTTPS URL.';
    } catch { return 'Sandbox URL must be a valid HTTPS URL.'; }
  }
  if (length(input.username) > 200) return 'Username must be 200 characters or fewer.';
  if (length(input.api_key) > 500) return 'API key must be 500 characters or fewer.';
  if (length(input.notes) > 2000) return 'Notes must be 2,000 characters or fewer.';
  return null;
}

export function validateUpload(file: { name: string; size: number; type: string }): string | null {
  try { sanitizeFileName(file.name); }
  catch (error) { return error instanceof Error ? error.message : 'Use a valid file name.'; }
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_UPLOAD_BYTES) {
    return 'Files must be 50 MB or smaller.';
  }
  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.type)) {
    return 'Choose a PDF, ZIP, PNG, JPEG, WebP, MP4 or plain text file.';
  }
  return null;
}
