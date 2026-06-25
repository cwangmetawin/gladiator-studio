import { useEffect, useState, type FormEvent } from 'react';
import { GLADIATOR_SLOTS, METAWIN_ORIGINALS } from '@/api/gameData';
import { fetchAllGames, saveGame, deleteGame, importCuratedGames, type AdminGame } from '@/api/catalogueDb';
import { ConfirmDialog } from './ConfirmDialog';

interface PendingConfirm {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly danger?: boolean;
  readonly run: () => Promise<void>;
}

const BLANK: AdminGame = {
  id: 0, title: '', description: '', link: '', timeline: '', image: '', landscapeImage: '',
  slug: '', genre: '', rtp: undefined, volatility: undefined, category: 'slot',
  isHot: false, sortOrder: 0, isPublished: true,
};

function GameEditor({ initial, onClose, onSaved }: { readonly initial: AdminGame; readonly onClose: () => void; readonly onSaved: (g: AdminGame) => void }) {
  const [g, setG] = useState<AdminGame>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof AdminGame>(k: K, v: AdminGame[K]) => setG((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try { onSaved(await saveGame(g)); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : 'Save failed'); setBusy(false); }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>{g.id ? 'Edit game' : 'New game'}</h3>
        {err && <div className="msg msg--err" style={{ marginBottom: 14 }}>{err}</div>}
        <div className="form-grid">
          <div className="field col-span">
            <label>Title</label>
            <input className="input" required value={g.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="field">
            <label>Category</label>
            <select className="select" value={g.category} onChange={(e) => set('category', e.target.value as AdminGame['category'])}>
              <option value="slot">Slot</option>
              <option value="mini">Original (mini)</option>
            </select>
          </div>
          <div className="field">
            <label>Genre</label>
            <input className="input" value={g.genre ?? ''} onChange={(e) => set('genre', e.target.value)} />
          </div>
          <div className="field col-span">
            <label>Description</label>
            <textarea className="textarea" value={g.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="field col-span">
            <label>Launch link</label>
            <input className="input" value={g.link} onChange={(e) => set('link', e.target.value)} placeholder="https://…" />
          </div>
          <div className="field col-span">
            <label>Cover image URL</label>
            <input className="input" value={g.image ?? ''} onChange={(e) => set('image', e.target.value)} placeholder="https://…" />
          </div>
          <div className="field col-span">
            <label>Landscape art URL <span className="hint">(slots — wide key-art)</span></label>
            <input className="input" value={g.landscapeImage ?? ''} onChange={(e) => set('landscapeImage', e.target.value)} placeholder="https://…" />
          </div>
          <div className="field">
            <label>RTP %</label>
            <input className="input" type="number" step="0.01" value={g.rtp ?? ''} onChange={(e) => set('rtp', e.target.value === '' ? undefined : Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Volatility</label>
            <select className="select" value={g.volatility ?? ''} onChange={(e) => set('volatility', (e.target.value || undefined) as AdminGame['volatility'])}>
              <option value="">—</option>
              <option value="HIGH">HIGH</option>
              <option value="ULTRA">ULTRA</option>
            </select>
          </div>
          <div className="field">
            <label>Release date</label>
            <input className="input" type="date" value={g.timeline || ''} onChange={(e) => set('timeline', e.target.value)} />
          </div>
          <div className="field">
            <label>Sort order</label>
            <input className="input" type="number" value={g.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Slug</label>
            <input className="input" value={g.slug ?? ''} onChange={(e) => set('slug', e.target.value)} />
          </div>
          <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 22 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={g.isHot} onChange={(e) => set('isHot', e.target.checked)} /> Hot
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={g.isPublished} onChange={(e) => set('isPublished', e.target.checked)} /> Published
            </label>
          </div>
        </div>
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

export function GamesPanel() {
  const [games, setGames] = useState<AdminGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminGame | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  async function reload() {
    setLoading(true); setErr(null);
    try { setGames(await fetchAllGames()); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Load failed'); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function toggle(g: AdminGame, key: 'isHot' | 'isPublished') {
    try {
      const saved = await saveGame({ ...g, [key]: !g[key] });
      setGames((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Update failed'); }
  }

  function askDelete(g: AdminGame) {
    setConfirm({
      title: 'Delete game', confirmLabel: 'Delete', danger: true,
      message: `Delete "${g.title}"? This cannot be undone.`,
      run: async () => { await deleteGame(g.id); setGames((prev) => prev.filter((x) => x.id !== g.id)); },
    });
  }
  function askImport() {
    setConfirm({
      title: 'Import curated catalogue', confirmLabel: 'Import',
      message: 'Import the full curated catalogue (slots + originals) into the database? Existing rows with the same id are overwritten.',
      run: async () => { await importCuratedGames([...GLADIATOR_SLOTS, ...METAWIN_ORIGINALS]); await reload(); },
    });
  }
  async function runConfirm() {
    if (!confirm) return;
    setConfirmBusy(true); setErr(null);
    try { await confirm.run(); setConfirm(null); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Action failed'); }
    finally { setConfirmBusy(false); }
  }

  return (
    <div>
      <div className="toolbar">
        <span className="toolbar__title">Catalogue</span>
        <span className="count-pill">{games.length} games</span>
        <div className="admin__spacer" />
        <button className="btn" onClick={askImport}>Import curated catalogue</button>
        <button className="btn btn--primary" onClick={() => setEditing(BLANK)}>+ Add game</button>
      </div>

      {err && <div className="msg msg--err" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="card grid-rows">
        <div className="row row__head">
          <span>Art</span><span>Title</span><span>Type</span><span>RTP</span><span>State</span><span style={{ textAlign: 'right' }}>Actions</span>
        </div>
        {loading ? (
          <div className="center-note">Loading…</div>
        ) : games.length === 0 ? (
          <div className="center-note">No games yet. Click <b>Import curated catalogue</b> to seed, or add one.</div>
        ) : games.map((g) => (
          <div className="row" key={g.id}>
            <img className="row__thumb" src={g.image || g.landscapeImage || ''} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
            <div>
              <div className="row__title">{g.title} {g.isHot && <span className="tag tag--hot">Hot</span>}</div>
              <div className="row__sub">{g.genre || '—'} · {g.timeline || 'no date'}</div>
            </div>
            <span className={`tag ${g.category === 'slot' ? 'tag--slot' : 'tag--mini'}`}>{g.category}</span>
            <span className="row__sub">{g.rtp != null ? `${g.rtp}%` : '—'}</span>
            <button className={`tag row__state ${g.isPublished ? '' : 'tag--off'}`} onClick={() => toggle(g, 'isPublished')} title="Toggle published">
              {g.isPublished ? 'Live' : 'Hidden'}
            </button>
            <div className="row__actions">
              <button className="btn btn--sm row__hot" onClick={() => toggle(g, 'isHot')}>{g.isHot ? 'Unhot' : 'Hot'}</button>
              <button className="btn btn--sm" onClick={() => setEditing(g)}>Edit</button>
              <button className="btn btn--sm btn--danger" onClick={() => askDelete(g)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <GameEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => { setGames((prev) => prev.some((x) => x.id === saved.id) ? prev.map((x) => (x.id === saved.id ? saved : x)) : [...prev, saved]); setEditing(null); }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel}
          danger={confirm.danger} busy={confirmBusy} onConfirm={runConfirm} onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
