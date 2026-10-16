import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FolderOpen, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllGames, type AdminGame } from '@/api/catalogueDb';
import { buildStoragePath, fileSizeLabel, fileTypeLabel, PARTNER_BUCKET, validateUpload } from '../partner/portalHelpers';
import { listPartnerFiles } from '../partner/portalStorage';
import type { PartnerFile } from '../partner/portalTypes';
import { ConfirmDialog } from './ConfirmDialog';
import { PartnerFileDropzone } from './PartnerFileDropzone';
import { useToast } from './Toast';

type Folder = 'assets' | 'certificates' | 'docs';
const errorText = (error: unknown, fallback: string): string => error && typeof error === 'object' && 'message' in error ? String(error.message) : fallback;
function displayDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB');
}

/** Admin-only management of private partner files; names never become public URLs. */
export function PartnerFilesPanel() {
  const { toast } = useToast();
  const [folder, setFolder] = useState<Folder>('docs');
  const [slug, setSlug] = useState('');
  const [games, setGames] = useState<AdminGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [files, setFiles] = useState<PartnerFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<PartnerFile | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const gamesGeneration = useRef(0);
  const id = useId();
  const prefix = folder === 'docs' ? 'docs' : slug ? `${folder}/${slug}` : null;
  const busy = uploading || deleteBusy;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const loadGames = useCallback(async () => {
    const generation = ++gamesGeneration.current;
    setGamesLoading(true); setGamesError(null);
    try {
      const rows = await fetchAllGames();
      if (!mounted.current || generation !== gamesGeneration.current) return;
      const withSlug = rows.filter((game) => game.slug);
      setGames(withSlug); setSlug((current) => current || withSlug[0]?.slug || '');
    } catch (error) {
      if (mounted.current && generation === gamesGeneration.current) setGamesError(errorText(error, 'Games could not be loaded.'));
    } finally {
      if (mounted.current && generation === gamesGeneration.current) setGamesLoading(false);
    }
  }, []);
  useEffect(() => { void loadGames(); }, [loadGames]);
  useEffect(() => {
    let cancelled = false;
    setFiles([]); setLoadError(null); setActionError(null);
    if (!prefix) { setLoading(false); return; }
    setLoading(true);
    void listPartnerFiles(prefix).then((rows) => { if (!cancelled) setFiles(rows); }).catch((error: unknown) => {
      if (!cancelled) setLoadError(errorText(error, 'Files could not be loaded.'));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [prefix, reload]);

  async function upload(file: File) {
    if (inFlight.current || !prefix) return;
    const validation = validateUpload(file);
    if (validation) { setActionError(validation); return; }
    let path: string;
    try { path = buildStoragePath(folder, slug, file.name); }
    catch (error) { setActionError(errorText(error, 'Choose a valid folder and file name.')); return; }
    inFlight.current = true; setUploading(true); setActionError(null);
    try {
      const { error } = await supabase.storage.from(PARTNER_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      if (!mounted.current) return;
      setReload((value) => value + 1); toast('File uploaded.');
    } catch (error) {
      if (mounted.current) setActionError(errorText(error, 'Upload failed. Please try again.'));
    } finally {
      inFlight.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  async function deleteFile() {
    if (!deleting || inFlight.current) return;
    const file = deleting;
    inFlight.current = true; setDeleteBusy(true); setActionError(null);
    try {
      const { error } = await supabase.storage.from(PARTNER_BUCKET).remove([file.path]);
      if (error) throw error;
      if (!mounted.current) return;
      setDeleting(null); setReload((value) => value + 1); toast('File deleted.');
    } catch (error) {
      if (mounted.current) { setDeleting(null); setActionError(errorText(error, 'The file could not be deleted. Please try again.')); }
    } finally {
      inFlight.current = false;
      if (mounted.current) setDeleteBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby={`${id}-heading`} style={{ padding: 18, marginTop: 24 }}>
      <div className="toolbar"><h2 id={`${id}-heading`} className="toolbar__title" style={{ margin: 0 }}><FolderOpen size={18} aria-hidden="true" /> Partner files</h2></div>
      <p className="hint">Private files are available to every active partner. Existing files are never overwritten.</p>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field"><label htmlFor={`${id}-folder`}>Folder</label><select id={`${id}-folder`} className="select" value={folder} disabled={busy} onChange={(event) => setFolder(event.target.value as Folder)}><option value="assets">Assets</option><option value="certificates">Certificates</option><option value="docs">Docs</option></select></div>
        {folder !== 'docs' && <div className="field"><label htmlFor={`${id}-game`}>Game</label><select id={`${id}-game`} className="select" value={slug} disabled={busy || gamesLoading} onChange={(event) => setSlug(event.target.value)}>{!slug && <option value="">{gamesLoading ? 'Loading games…' : 'Choose a game'}</option>}{games.map((game) => <option key={game.id} value={game.slug}>{game.title} — {game.slug}</option>)}</select>{!gamesLoading && !games.length && !gamesError && <span className="hint">Add a game with a slug before uploading to this folder.</span>}</div>}
      </div>
      {gamesError && <div className="msg msg--err" role="alert" style={{ marginBottom: 14 }}>{gamesError} <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void loadGames()}>Retry games</button></div>}
      <PartnerFileDropzone busy={uploading} disabled={busy || !prefix} onFile={(file) => void upload(file)} />
      {actionError && <div className="msg msg--err" role="alert" style={{ marginTop: 14 }}>{actionError}</div>}
      <p className="hint" style={{ marginTop: 14 }}>Folder: {prefix ? `${prefix}/` : 'Choose a game'}</p>
      {loading && <p role="status">Loading files…</p>}
      {loadError && <div className="msg msg--err" role="alert">{loadError} <button type="button" className="btn btn--sm" disabled={busy} onClick={() => setReload((value) => value + 1)}>Retry</button></div>}
      {!loading && !loadError && prefix && !files.length && <p className="list-empty">No files in this folder yet.</p>}
      <ul className="list-editor" style={{ listStyle: 'none', padding: 0 }}>
        {files.map((file) => <li key={file.path} className="list-item"><div className="list-item__head"><div style={{ minWidth: 0, overflowWrap: 'anywhere' }}><strong>{file.name}</strong><div className="hint" style={{ marginTop: 5 }}>{fileTypeLabel(file.name, file.mimeType)} · {fileSizeLabel(file.size)} · {displayDate(file.updatedAt)}</div></div><button type="button" className="btn btn--sm btn--danger" disabled={busy} aria-label={`Delete ${file.name}`} onClick={() => setDeleting(file)}><Trash2 size={15} aria-hidden="true" /> Delete</button></div></li>)}
      </ul>
      {deleting && <ConfirmDialog title="Delete file" message={`Delete “${deleting.name}” from ${prefix}/? Partners will no longer be able to download it.`} confirmLabel="Delete" danger busy={deleteBusy} onConfirm={() => void deleteFile()} onCancel={() => setDeleting(null)} />}
    </section>
  );
}
