import { supabase } from '@/lib/supabase';

// Public, read-only image bucket. Writes are admin-only (enforced by RLS — see
// the `uploads` storage migration). Anyone can read the resulting public URLs.
const BUCKET = 'uploads';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif'] as const;

function ext(name: string): string {
  const e = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
  return e || 'bin';
}

function objectPath(file: File): string {
  const d = new Date();
  const folder = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${folder}/${rand}.${ext(file.name)}`;
}

/**
 * Validate and upload an image to the `uploads` bucket, returning its public URL.
 * Throws a user-friendly Error on any validation or transport failure.
 */
export async function uploadImage(file: File): Promise<string> {
  if (!OK_TYPES.includes(file.type as (typeof OK_TYPES)[number])) {
    throw new Error('Unsupported file type — use JPG, PNG, WebP, GIF, AVIF or SVG.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — max 5 MB.`);
  }

  const path = objectPath(file);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error(error.message || 'Upload failed.');

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Upload succeeded but no public URL was returned.');
  return data.publicUrl;
}
