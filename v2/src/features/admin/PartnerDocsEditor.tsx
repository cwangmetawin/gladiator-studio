import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';
import { useUnsaved } from './Unsaved';
import { validatePartnerDoc, type PartnerDocDraft } from './partnerDocForm';

interface DocRow {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly sort: number;
  readonly updated_at: string;
}
type Selection = { readonly kind: 'new' } | { readonly kind: 'existing'; readonly doc: DocRow };
const BLANK: PartnerDocDraft = { title: '', body: '', sort: '0' };
const COLUMNS = 'id,title,body,sort,updated_at';
const orderDocs = (docs: readonly DocRow[]): DocRow[] => [...docs].sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
const errorText = (error: unknown, fallback: string): string => error && typeof error === 'object' && 'message' in error ? String(error.message) : fallback;

/** Shared plain-text integration documents, with one explicit save per draft. */
export function PartnerDocsEditor() {
  const { toast } = useToast();
  const { setDirty } = useUnsaved();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PartnerDocDraft>(BLANK);
  const [saved, setSaved] = useState<PartnerDocDraft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<Selection | null>(null);
  const [deleting, setDeleting] = useState<DocRow | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const loadGeneration = useRef(0);
  const id = useId();
  const dirty = draft.title !== saved.title || draft.body !== saved.body || draft.sort !== saved.sort;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setDirty('partner-docs', dirty); return () => setDirty('partner-docs', false); }, [dirty, setDirty]);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    const generation = ++loadGeneration.current;
    setLoading(true); setLoadError(null);
    try {
      const { data, error } = await supabase.from('partner_docs').select(COLUMNS).order('sort').order('title');
      if (error) throw error;
      if (mounted.current && generation === loadGeneration.current) setDocs(data as DocRow[] ?? []);
    } catch (error) {
      if (mounted.current && generation === loadGeneration.current) setLoadError(errorText(error, 'Documents could not be loaded.'));
    } finally {
      if (mounted.current && generation === loadGeneration.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function select(next: Selection) {
    const value = next.kind === 'new' ? BLANK : { title: next.doc.title, body: next.doc.body, sort: String(next.doc.sort) };
    setSelectedId(next.kind === 'new' ? null : next.doc.id);
    setDraft(value); setSaved(value); setActionError(null);
  }

  function requestSelection(next: Selection) {
    if (loading || busy || (next.kind === 'existing' && next.doc.id === selectedId)) return;
    if (dirty) { setPendingSelection(next); return; }
    select(next);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (loading || inFlight.current) return;
    const validation = validatePartnerDoc(draft);
    if (validation) { setActionError(validation); return; }
    inFlight.current = true; setBusy(true); setActionError(null);
    const payload = { title: draft.title.trim(), body: draft.body, sort: Number(draft.sort) };
    try {
      const query = selectedId
        ? supabase.from('partner_docs').update(payload).eq('id', selectedId)
        : supabase.from('partner_docs').insert(payload);
      const { data, error } = await query.select(COLUMNS).single();
      if (error) throw error;
      if (!data) throw new Error('The document could not be saved.');
      if (!mounted.current) return;
      const row = data as DocRow;
      setDocs((current) => orderDocs([...current.filter((doc) => doc.id !== row.id), row]));
      select({ kind: 'existing', doc: row });
      toast('Document saved.');
    } catch (error) {
      if (mounted.current) setActionError(errorText(error, 'The document could not be saved. Please try again.'));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function deleteDoc() {
    if (loading || !deleting || inFlight.current) return;
    const doc = deleting;
    inFlight.current = true; setBusy(true); setActionError(null);
    try {
      const { error } = await supabase.from('partner_docs').delete().eq('id', doc.id);
      if (error) throw error;
      if (!mounted.current) return;
      setDocs((current) => current.filter((item) => item.id !== doc.id));
      if (selectedId === doc.id) select({ kind: 'new' });
      setDeleting(null); toast('Document deleted.');
    } catch (error) {
      if (mounted.current) { setDeleting(null); setActionError(errorText(error, 'The document could not be deleted. Please try again.')); }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby={`${id}-heading`} style={{ padding: 18, marginTop: 24 }}>
      <div className="toolbar">
        <h2 id={`${id}-heading`} className="toolbar__title" style={{ margin: 0 }}><FileText size={18} aria-hidden="true" /> Integration docs</h2>
        <div className="admin__spacer" />
        <button type="button" className="btn btn--sm" disabled={loading || busy} onClick={() => requestSelection({ kind: 'new' })}><Plus size={15} aria-hidden="true" /> New document</button>
      </div>
      <p className="hint">Documents are shared with every active partner. Text is shown as plain paragraphs.</p>
      {loadError && <div className="msg msg--err" role="alert">{loadError} <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void load()}>Retry</button></div>}
      {loading && <p role="status">Loading documents…</p>}
      <div className="content-layout" style={{ marginTop: 16 }}>
        <nav className="content-menu" aria-label="Integration documents">
          {!loading && !docs.length && <p className="list-empty">No documents yet.</p>}
          {docs.map((doc) => (
            <button key={doc.id} type="button" className={`content-menu__item ${selectedId === doc.id ? 'is-active' : ''}`} disabled={loading || busy} aria-current={selectedId === doc.id ? 'true' : undefined} onClick={() => requestSelection({ kind: 'existing', doc })}>
              <span className="tag">{doc.sort}</span> {doc.title}
            </button>
          ))}
        </nav>
        <form className="content-body" onSubmit={save}>
          <div className="toolbar"><h3 style={{ margin: 0 }}>{selectedId ? 'Edit document' : 'New document'}</h3>{dirty && <span className="tag">Unsaved</span>}</div>
          {actionError && <div className="msg msg--err" role="alert" style={{ marginBottom: 14 }}>{actionError}</div>}
          <fieldset disabled={loading || busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="form-grid">
              <div className="field"><label htmlFor={`${id}-title`}>Title</label><input id={`${id}-title`} className="input" required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /><span className="hint">Up to 200 characters</span></div>
              <div className="field"><label htmlFor={`${id}-sort`}>Sort order</label><input id={`${id}-sort`} className="input" type="number" required step="1" min="-2147483648" max="2147483647" value={draft.sort} onChange={(event) => setDraft((current) => ({ ...current, sort: event.target.value }))} /></div>
              <div className="field col-span"><label htmlFor={`${id}-body`}>Body</label><textarea id={`${id}-body`} className="textarea" rows={12} value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} /><span className="hint">{Array.from(draft.body).length.toLocaleString('en-GB')} / 50,000 characters</span></div>
            </div>
            <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
              <button type="submit" className="btn btn--primary" disabled={!dirty}>{busy ? 'Saving…' : 'Save document'}</button>
              {selectedId && <button type="button" className="btn btn--danger" onClick={() => { const doc = docs.find((item) => item.id === selectedId); if (doc) setDeleting(doc); }}><Trash2 size={15} aria-hidden="true" /> Delete document</button>}
            </div>
          </fieldset>
        </form>
      </div>
      {pendingSelection && <ConfirmDialog title="Unsaved changes" message="Discard your unsaved document edits and open another document?" confirmLabel="Discard changes" danger onConfirm={() => { select(pendingSelection); setPendingSelection(null); }} onCancel={() => setPendingSelection(null)} />}
      {deleting && <ConfirmDialog title="Delete document" message={`Delete “${deleting.title}” for all partners? This also discards any open edits to that document.`} confirmLabel="Delete" danger busy={busy} onConfirm={() => void deleteDoc()} onCancel={() => setDeleting(null)} />}
    </section>
  );
}
