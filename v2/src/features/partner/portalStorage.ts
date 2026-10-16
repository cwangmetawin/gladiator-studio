import { supabase } from '@/lib/supabase';
import { PARTNER_BUCKET, SIGNED_URL_SECONDS, sanitizeFileName, validateStoragePath } from './portalHelpers';
import type { PartnerFile } from './portalTypes';

const PAGE_SIZE = 1000;

function validPrefix(prefix: string): boolean {
  return ['assets', 'certificates', 'docs'].includes(prefix) || validateStoragePath(`${prefix}/__directory__`);
}

/** List metadata only. Private download URLs are created when a user requests a file. */
export async function listPartnerFiles(prefix: string): Promise<PartnerFile[]> {
  if (!validPrefix(prefix)) throw new Error('Choose a valid partner file folder.');
  const bucket = supabase.storage.from(PARTNER_BUCKET);
  const pending = [prefix];
  const visited = new Set<string>();
  const files: PartnerFile[] = [];

  while (pending.length) {
    const directory = pending.pop()!;
    if (visited.has(directory)) continue;
    visited.add(directory);
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await bucket.list(directory, {
        limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(error.message || 'Partner files could not be loaded.');
      const entries = data ?? [];
      for (const item of entries) {
        if (item.name === '.emptyFolderPlaceholder') continue;
        try { if (sanitizeFileName(item.name) !== item.name) continue; }
        catch { continue; }
        const path = `${directory}/${item.name}`;
        if (item.id === null && item.metadata === null) {
          if (validPrefix(path)) pending.push(path);
          continue;
        }
        if (!validateStoragePath(path)) continue;
        const metadata: Record<string, unknown> = item.metadata ?? {};
        files.push({
          path,
          name: item.name,
          size: typeof metadata.size === 'number' ? metadata.size : -1,
          mimeType: typeof metadata.mimetype === 'string' ? metadata.mimetype : '',
          updatedAt: item.updated_at || item.created_at || '',
        });
      }
      if (entries.length < PAGE_SIZE) break;
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function createPartnerDownload(file: PartnerFile): Promise<string> {
  if (!validateStoragePath(file.path) || file.path.split('/').at(-1) !== file.name) {
    throw new Error('This file path is invalid. Refresh the file list and try again.');
  }
  const { data, error } = await supabase.storage.from(PARTNER_BUCKET)
    .createSignedUrl(file.path, SIGNED_URL_SECONDS, { download: file.name });
  if (error) throw new Error(error.message || 'The download could not be prepared.');
  if (!data?.signedUrl) throw new Error('The download could not be prepared. Please try again.');
  return data.signedUrl;
}
