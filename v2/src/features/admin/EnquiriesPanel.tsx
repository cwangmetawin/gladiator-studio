import { useEffect, useState } from 'react';
import { fetchEnquiries, deleteEnquiry, type Enquiry } from '@/api/enquiriesDb';
import { ConfirmDialog } from './ConfirmDialog';
import { RailCard } from './Rail';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ISO timestamp → readable local date; falls back to the raw value if unparseable. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function EnquiriesPanel() {
  const [items, setItems] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<Enquiry | null>(null); // delete-confirm target
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true); setErr(null);
    try { setItems(await fetchEnquiries()); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function runDelete() {
    if (!pending) return;
    setBusy(true); setErr(null);
    try {
      await deleteEnquiry(pending.id);
      setItems((prev) => prev.filter((x) => x.id !== pending.id));
      setPending(null);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Delete failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="admin__layout">
      <div className="admin__primary">
      <div className="toolbar">
        <span className="toolbar__title">Enquiries</span>
        <span className="count-pill">{items.length} total</span>
        <div className="admin__spacer" />
        <button className="btn" onClick={reload} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {err && <div className="msg msg--err" style={{ marginBottom: 14 }}>{err}</div>}

      {loading ? (
        <div className="card"><div className="center-note">Loading…</div></div>
      ) : items.length === 0 ? (
        <div className="card"><div className="center-note">No enquiries yet. Contact-form submissions appear here.</div></div>
      ) : (
        <div className="enq-list">
          {items.map((e) => {
            const replyable = EMAIL_RE.test(e.email);
            return (
              <div className="card enq" key={e.id}>
                <div className="enq__head">
                  <div className="enq__who">
                    {e.name || 'Anonymous'}{e.company && <span className="enq__co"> · {e.company}</span>}
                  </div>
                  <div className="enq__meta">
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
                {e.message && <p className="enq__msg">{e.message}</p>}
                <div className="enq__foot">
                  {replyable && (
                    <a className="btn btn--sm" href={`mailto:${e.email}?subject=${encodeURIComponent('Re: your enquiry to Gladiator Studio')}`}>Reply</a>
                  )}
                  <button className="btn btn--sm btn--danger" onClick={() => setPending(e)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      <aside className="admin__rail">
        <RailCard title="Inbox">
          <div className="rail-stat"><span className="rail-stat__label">Total</span><span className="rail-stat__value">{items.length}</span></div>
          <div className="rail-stat"><span className="rail-stat__label">Emailed</span><span className="rail-stat__value">{items.filter((e) => e.emailed).length}</span></div>
          <div className="rail-stat"><span className="rail-stat__label">Stored only</span><span className="rail-stat__value">{items.filter((e) => !e.emailed).length}</span></div>
        </RailCard>
        <RailCard title="Tips">
          <div className="rail-card__note"><b>Reply</b> opens your mail client. <b>Emailed</b> means it also reached the studio inbox; <b>Stored only</b> means delivery was off or failed.</div>
        </RailCard>
      </aside>

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
