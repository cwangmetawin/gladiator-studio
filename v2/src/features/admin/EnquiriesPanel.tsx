import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { fetchEnquiries, deleteEnquiry, setEnquiryHandled, sendReply, type Enquiry } from '@/api/enquiriesDb';
import { ConfirmDialog } from './ConfirmDialog';
import { RailCard } from './Rail';
import { useToast } from './Toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Filter = 'new' | 'handled' | 'all';

/** ISO timestamp → readable local date; falls back to the raw value if unparseable. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Reply composer — sends from the studio inbox via the reply-enquiry fn ────
function ReplyModal({ enquiry, onClose, onSent }: { readonly enquiry: Enquiry; readonly onClose: () => void; readonly onSent: (repliedAt: string) => void }) {
  const [subject, setSubject] = useState('Re: your enquiry to Gladiator Studio');
  const [message, setMessage] = useState(`Hi ${enquiry.name || 'there'},\n\n`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try { onSent(await sendReply(enquiry.id, subject.trim(), message.trim())); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Reply failed'); setBusy(false); }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Reply to {enquiry.name || 'enquiry'}</h3>
        {err && <div className="msg msg--err" style={{ marginBottom: 14 }}>{err}</div>}
        <div className="form-grid">
          <div className="field col-span">
            <label>To</label>
            <div className="reply-to">Sends from the studio inbox to <b>{enquiry.email}</b></div>
          </div>
          <div className="field col-span">
            <label>Subject</label>
            <input className="input" required value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="field col-span">
            <label>Message</label>
            <textarea className="textarea" required rows={8} value={message} onChange={(e) => setMessage(e.target.value)} style={{ minHeight: 170 }} />
          </div>
        </div>
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Sending…' : 'Send reply'}</button>
        </div>
      </form>
    </div>
  );
}

// ─── One enquiry card ─────────────────────────────────────────────────────────
function EnquiryCard({ e, onReply, onToggleHandled, onDelete }: {
  readonly e: Enquiry;
  readonly onReply: (e: Enquiry) => void;
  readonly onToggleHandled: (e: Enquiry) => void;
  readonly onDelete: (e: Enquiry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const replyable = EMAIL_RE.test(e.email);
  const long = e.message.length > 220;

  return (
    <div className={`card enq ${e.handled ? 'enq--handled' : ''}`}>
      <div className="enq__head">
        <div className="enq__who">{e.name || 'Anonymous'}{e.company && <span className="enq__co"> · {e.company}</span>}</div>
        <div className="enq__meta">
          {e.handled && <span className="tag tag--handled">Handled</span>}
          {e.repliedAt && <span className="tag tag--replied" title={`Replied ${formatDate(e.repliedAt)}`}>Replied</span>}
          {e.enquiryType && <span className="tag">{e.enquiryType}</span>}
          <span className={`tag ${e.emailed ? 'tag--ok' : 'tag--off'}`} title={e.emailed ? 'Emailed to the studio inbox' : 'Stored but not emailed'}>
            {e.emailed ? 'Emailed' : 'Not emailed'}
          </span>
          <time className="enq__date" dateTime={e.createdAt}>{formatDate(e.createdAt)}</time>
        </div>
      </div>
      <div className="enq__email">
        {replyable ? <a href={`mailto:${e.email}`}>{e.email}</a> : (e.email || '—')}
      </div>
      {e.message && <p className={`enq__msg ${long && !expanded ? 'enq__msg--clamp' : ''}`}>{e.message}</p>}
      {long && <button type="button" className="enq__more" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Show less' : 'Show more'}</button>}
      <div className="enq__foot">
        <button type="button" className="btn btn--sm" onClick={() => onToggleHandled(e)}>{e.handled ? 'Reopen' : 'Mark handled'}</button>
        <div className="enq__foot-spacer" />
        {replyable && <button type="button" className="btn btn--sm btn--primary" onClick={() => onReply(e)}>{e.repliedAt ? 'Reply again' : 'Reply'}</button>}
        <button type="button" className="btn btn--sm btn--danger" onClick={() => onDelete(e)}>Delete</button>
      </div>
    </div>
  );
}

export function EnquiriesPanel() {
  const { toast } = useToast();
  const [items, setItems] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('new');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Enquiry | null>(null); // delete-confirm target
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<Enquiry | null>(null);

  async function reload() {
    setLoading(true); setErr(null);
    try { setItems(await fetchEnquiries()); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  const counts = useMemo(() => ({
    total: items.length,
    nu: items.filter((e) => !e.handled).length,
    handled: items.filter((e) => e.handled).length,
    emailed: items.filter((e) => e.emailed).length,
  }), [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list: readonly Enquiry[] = items;
    if (filter === 'new') list = list.filter((e) => !e.handled);
    else if (filter === 'handled') list = list.filter((e) => e.handled);
    if (q) list = list.filter((e) => `${e.name} ${e.company} ${e.email} ${e.enquiryType} ${e.message}`.toLowerCase().includes(q));
    return list;
  }, [items, filter, query]);

  async function toggleHandled(e: Enquiry) {
    try {
      const updated = await setEnquiryHandled(e.id, !e.handled);
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast(updated.handled ? 'Marked handled.' : 'Reopened.');
    } catch (er) { toast(er instanceof Error ? er.message : 'Update failed', 'err'); }
  }

  async function runDelete() {
    if (!pending) return;
    setBusy(true);
    try {
      await deleteEnquiry(pending.id);
      setItems((prev) => prev.filter((x) => x.id !== pending.id));
      toast('Enquiry deleted.');
      setPending(null);
    } catch (er) { toast(er instanceof Error ? er.message : 'Delete failed', 'err'); }
    finally { setBusy(false); }
  }

  function onReplied(repliedAt: string) {
    if (replyTo) {
      const id = replyTo.id;
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, handled: true, repliedAt } : x)));
    }
    toast('Reply sent — marked handled.');
    setReplyTo(null);
  }

  const filtered = query.trim() !== '' || filter !== 'all';

  return (
    <div className="admin__layout">
      <div className="admin__primary">
        <div className="toolbar">
          <span className="toolbar__title">Enquiries</span>
          <span className="count-pill">{counts.total} total</span>
          <div className="admin__spacer" />
          <button className="btn" onClick={reload} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>

        <div className="toolbar">
          <div className="seg" role="tablist" aria-label="Filter enquiries">
            <button type="button" role="tab" aria-selected={filter === 'new'} className={`seg__btn ${filter === 'new' ? 'is-active' : ''}`} onClick={() => setFilter('new')}>New<span className="seg__count">{counts.nu}</span></button>
            <button type="button" role="tab" aria-selected={filter === 'handled'} className={`seg__btn ${filter === 'handled' ? 'is-active' : ''}`} onClick={() => setFilter('handled')}>Handled<span className="seg__count">{counts.handled}</span></button>
            <button type="button" role="tab" aria-selected={filter === 'all'} className={`seg__btn ${filter === 'all' ? 'is-active' : ''}`} onClick={() => setFilter('all')}>All<span className="seg__count">{counts.total}</span></button>
          </div>
          <span className="toolbar__search">
            <Search size={15} aria-hidden="true" />
            <input className="input input--search" type="search" value={query} placeholder="Search name, email, message…" onChange={(e) => setQuery(e.target.value)} aria-label="Search enquiries" />
          </span>
        </div>

        {err && <div className="msg msg--err" style={{ marginBottom: 14 }}>{err}</div>}

        {loading ? (
          <div className="card"><div className="center-note">Loading…</div></div>
        ) : items.length === 0 ? (
          <div className="card"><div className="center-note">No enquiries yet. Contact-form submissions appear here.</div></div>
        ) : visible.length === 0 ? (
          <div className="card"><div className="center-note">
            No enquiries match this view.
            {filtered && <button className="link-btn" style={{ marginLeft: 8 }} onClick={() => { setQuery(''); setFilter('all'); }}>Clear</button>}
          </div></div>
        ) : (
          <div className="enq-list">
            {visible.map((e) => (
              <EnquiryCard key={e.id} e={e} onReply={setReplyTo} onToggleHandled={toggleHandled} onDelete={setPending} />
            ))}
          </div>
        )}
      </div>

      <aside className="admin__rail">
        <RailCard title="Inbox">
          <div className="rail-stat"><span className="rail-stat__label">Total</span><span className="rail-stat__value">{counts.total}</span></div>
          <div className="rail-stat"><span className="rail-stat__label">New</span><span className="rail-stat__value">{counts.nu}</span></div>
          <div className="rail-stat"><span className="rail-stat__label">Handled</span><span className="rail-stat__value">{counts.handled}</span></div>
          <div className="rail-stat"><span className="rail-stat__label">Emailed</span><span className="rail-stat__value">{counts.emailed}</span></div>
        </RailCard>
        <RailCard title="Tips">
          <div className="rail-card__note"><b>Reply</b> sends straight from the studio inbox (no mail app needed) and marks the enquiry handled. <b>Mark handled</b> clears it from <b>New</b> without deleting.</div>
        </RailCard>
      </aside>

      {replyTo && <ReplyModal enquiry={replyTo} onClose={() => setReplyTo(null)} onSent={onReplied} />}

      {pending && (
        <ConfirmDialog
          title="Delete enquiry"
          message={`Delete the enquiry from ${pending.name || pending.email || 'this person'}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={runDelete}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
