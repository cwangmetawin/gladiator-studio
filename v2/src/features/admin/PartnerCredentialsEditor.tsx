import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { validateCredential, maskApiKey, type CredentialRow } from '@/features/partner/portalHelpers';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';
import { useUnsaved } from './Unsaved';
import { deletePartnerCredential, fetchPartnerCredentials, savePartnerCredential, type CredentialDraft } from './partnerAdminApi';

const BLANK: CredentialDraft = { label: '', sandbox_url: '', username: '', api_key: '', notes: '' };
const toDraft = (row: CredentialRow): CredentialDraft => ({ label: row.label, sandbox_url: row.sandbox_url ?? '', username: row.username ?? '', api_key: row.api_key ?? '', notes: row.notes ?? '' });
const message = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'The request failed. Please try again.';
interface Pending { readonly title: string; readonly message: string; readonly label: string; readonly danger?: boolean; readonly run: () => void | Promise<void> }

export function PartnerCredentialsEditor({ partnerId, onDirtyChange }: { readonly partnerId: string; readonly onDirtyChange: (dirty: boolean) => void }) {
  const { toast } = useToast();
  const { setDirty } = useUnsaved();
  const prefix = useId();
  const loadVersion = useRef(0);
  const [rows, setRows] = useState<CredentialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState<CredentialDraft>(BLANK);
  const [original, setOriginal] = useState<CredentialDraft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const dirty = editing !== undefined && JSON.stringify(draft) !== JSON.stringify(original);
  useEffect(() => { setDirty(`partner-credentials:${partnerId}`, dirty); onDirtyChange(dirty); }, [dirty, partnerId, setDirty, onDirtyChange]);
  useEffect(() => () => { setDirty(`partner-credentials:${partnerId}`, false); onDirtyChange(false); }, [partnerId, setDirty, onDirtyChange]);

  const reload = useCallback(async () => {
    const request = ++loadVersion.current;
    setLoading(true); setError(null);
    try { const next = await fetchPartnerCredentials(partnerId); if (request === loadVersion.current) setRows(next); }
    catch (reason) { if (request === loadVersion.current) setError(message(reason)); }
    finally { if (request === loadVersion.current) setLoading(false); }
  }, [partnerId]);
  useEffect(() => { void reload(); return () => { loadVersion.current += 1; }; }, [reload]);
  function select(row: CredentialRow | null) {
    if (busy || loading) return;
    const run = () => {
      const next = row ? toDraft(row) : BLANK;
      setDraft(next); setOriginal(next); setEditing(row?.id ?? null); setError(null);
    };
    if (dirty) setConfirm({ title: 'Discard credential changes?', message: 'Your credential changes have not been saved.', label: 'Discard changes', danger: true, run });
    else run();
  }
  function cancel() {
    const run = () => { setEditing(undefined); setDraft(BLANK); setOriginal(BLANK); setError(null); };
    if (dirty) setConfirm({ title: 'Discard credential changes?', message: 'Your credential changes have not been saved.', label: 'Discard changes', danger: true, run });
    else run();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || loading || editing === undefined) return;
    const invalid = validateCredential(draft);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError(null);
    try {
      const saved = await savePartnerCredential(partnerId, editing, draft);
      setRows((prev) => [...prev.filter((row) => row.id !== saved.id), saved].sort((a, b) => a.label.localeCompare(b.label)));
      setEditing(undefined); setDraft(BLANK); setOriginal(BLANK); toast('Test credentials saved.');
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  function askDelete(row: CredentialRow) {
    if (busy || loading) return;
    setConfirm({ title: 'Delete test credentials', message: `Delete "${row.label}"? This cannot be undone.`, label: 'Delete', danger: true, run: async () => {
      await deletePartnerCredential(partnerId, row.id);
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      if (editing === row.id) { setEditing(undefined); setDraft(BLANK); setOriginal(BLANK); }
      toast('Test credentials deleted.');
    } });
  }
  async function runConfirm() {
    if (!confirm || busy) return;
    setBusy(true);
    try { await confirm.run(); setConfirm(null); }
    catch (reason) { toast(message(reason), 'err'); }
    finally { setBusy(false); }
  }
  const field = (key: keyof CredentialDraft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));
  return (
    <section className="card partner-admin-section" aria-labelledby={`${prefix}-heading`}>
      <div className="toolbar"><h3 id={`${prefix}-heading`}>Test credentials</h3><button className="btn btn--sm" type="button" disabled={busy || loading} onClick={() => select(null)}>Add credentials</button></div>
      {error && <p className="msg msg--err" role="alert">{error}{editing === undefined && <button className="btn btn--sm" type="button" disabled={busy || loading} onClick={() => { void reload(); }}>Retry</button>}</p>}
      {loading ? <p role="status" className="hint">Loading credentials…</p> : rows.length === 0 ? <p className="list-empty">No test credentials yet.</p> : (
        <ul className="partner-admin-list">{rows.map((row) => <li key={row.id}>
          <div><strong>{row.label}</strong><span className="hint">{row.username || 'No username'} · {maskApiKey(row.api_key ?? '')}</span></div>
          <div className="partner-admin-actions"><button className="btn btn--sm" type="button" onClick={() => select(row)} disabled={busy || loading}>Edit</button><button className="btn btn--sm btn--danger" type="button" onClick={() => askDelete(row)} disabled={busy || loading || dirty}>Delete</button></div>
        </li>)}</ul>
      )}
      {editing !== undefined && <form onSubmit={(event) => { void save(event); }} className="partner-admin-editor">
        <h4>{editing ? 'Edit credentials' : 'New credentials'}</h4>
        <fieldset disabled={busy || loading} className="partner-admin-fieldset"><div className="form-grid">
          <div className="field col-span"><label htmlFor={`${prefix}-label`}>Label</label><input id={`${prefix}-label`} className="input" value={draft.label} required onChange={(event) => field('label', event.target.value)} /></div>
          <div className="field col-span"><label htmlFor={`${prefix}-url`}>Sandbox URL</label><input id={`${prefix}-url`} className="input" type="url" placeholder="https://…" value={draft.sandbox_url} onChange={(event) => field('sandbox_url', event.target.value)} /></div>
          <div className="field"><label htmlFor={`${prefix}-username`}>Username</label><input id={`${prefix}-username`} className="input" autoComplete="off" value={draft.username} onChange={(event) => field('username', event.target.value)} /></div>
          <div className="field"><label htmlFor={`${prefix}-key`}>API key</label><input id={`${prefix}-key`} className="input" type="password" autoComplete="new-password" value={draft.api_key} onChange={(event) => field('api_key', event.target.value)} /></div>
          <div className="field col-span"><label htmlFor={`${prefix}-notes`}>Notes</label><textarea id={`${prefix}-notes`} className="textarea" value={draft.notes} onChange={(event) => field('notes', event.target.value)} /></div>
        </div><div className="modal__foot"><button className="btn btn--ghost" type="button" onClick={cancel}>Cancel</button><button className="btn btn--primary" type="submit">{busy ? 'Saving…' : 'Save credentials'}</button></div></fieldset>
      </form>}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.label} danger={confirm.danger} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => { void runConfirm(); }} />}
    </section>
  );
}
