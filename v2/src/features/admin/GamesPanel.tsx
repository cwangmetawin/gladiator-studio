import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { GLADIATOR_SLOTS, METAWIN_ORIGINALS } from '@/api/gameData';
import { fetchAllGames, saveGame, deleteGame, importCuratedGames, type AdminGame } from '@/api/catalogueDb';
import { ConfirmDialog } from './ConfirmDialog';
import { Dropzone } from './Dropzone';
import { useToast } from './Toast';

interface PendingConfirm {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly danger?: boolean;
  readonly run: () => Promise<void>;
}

type SortKey = 'sort' | 'title' | 'newest' | 'rtp';
type CatFilter = 'all' | 'slot' | 'mini';

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
            <Dropzone onUploaded={(u) => set('image', u)} onError={setErr} label="Drop cover image or click to upload" />
          </div>
          <div className="field col-span">
            <label>Landscape art URL <span className="hint">(slots — wide key-art)</span></label>
            <input className="input" value={g.landscapeImage ?? ''} onChange={(e) => set('landscapeImage', e.target.value)} placeholder="https://…" />
            <Dropzone onUploaded={(u) => set('landscapeImage', u)} onError={setErr} label="Drop landscape art or click to upload" />
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

/** Filter + sort the catalogue without mutating the source array. */
function selectGames(games: readonly AdminGame[], query: string, cat: CatFilter, sort: SortKey): AdminGame[] {
  const q = query.trim().toLowerCase();
  let list: readonly AdminGame[] = games;
  if (cat !== 'all') list = list.filter((g) => g.category === cat);
  if (q) list = list.filter((g) => `${g.title} ${g.genre ?? ''} ${g.slug ?? ''}`.toLowerCase().includes(q));
  const sorted = [...list];
  switch (sort) {
    case 'title': sorted.sort((a, b) => a.title.localeCompare(b.title)); break;
    case 'newest': sorted.sort((a, b) => (b.timeline || '').localeCompare(a.timeline || '')); break;
    case 'rtp': sorted.sort((a, b) => (b.rtp ?? -1) - (a.rtp ?? -1)); break;
    default: sorted.sort((a, b) => a.sortOrder - b.sortOrder); break;
  }
  return sorted;
}

export function GamesPanel() {
  const { toast } = useToast();
  const [games, setGames] = useState<AdminGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminGame | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<CatFilter>('all');
  const [sort, setSort] = useState<SortKey>('sort');
  const visible = useMemo(() => selectGames(games, query, cat, sort), [games, query, cat, sort]);
  const filtered = query.trim() !== '' || cat !== 'all';

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
    } catch (e) { toast(e instanceof Error ? e.message : 'Update failed', 'err'); }
  }

  function askDelete(g: AdminGame) {
    setConfirm({
      title: 'Delete game', confirmLabel: 'Delete', danger: true,
      message: `Delete "${g.title}"? This cannot be undone.`,
      run: async () => { await deleteGame(g.id); setGames((prev) => prev.filter((x) => x.id !== g.id)); toast(`Deleted "${g.title}".`); },
    });
  }
  function askImport() {
    setConfirm({
      title: 'Import curated catalogue', confirmLabel: 'Import',
      message: 'Import the full curated catalogue (slots + originals) into the database? Existing rows with the same id are overwritten.',
      run: async () => { const n = await importCuratedGames([...GLADIATOR_SLOTS, ...METAWIN_ORIGINALS]); await reload(); toast(`Imported ${n} games.`); },
    });
  }
  async function runConfirm() {
    if (!confirm) return;
    setConfirmBusy(true);
    try { await confirm.run(); setConfirm(null); }
    catch (e) { toast(e instanceof Error ? e.message : 'Action failed', 'err'); }
    finally { setConfirmBusy(false); }
  }

  return (
    <div>
      <div className="toolbar">
        <span className="toolbar__title">Catalogue</span>
        <span className="count-pill">{filtered ? `${visible.length} / ${games.length}` : `${games.length} games`}</span>
        <div className="admin__spacer" />
        <button className="btn" onClick={askImport}>Import curated catalogue</button>
        <button className="btn btn--primary" onClick={() => setEditing(BLANK)}>+ Add game</button>
      </div>

      <div className="toolbar">
        <span className="toolbar__search">
          <Search size={15} aria-hidden="true" />
          <input
            className="input input--search" type="search" value={query} placeholder="Search title, genre, slug…"
            onChange={(e) => setQuery(e.target.value)} aria-label="Search catalogue"
          />
        </span>
        <select className="select select--sm" value={cat} onChange={(e) => setCat(e.target.value as CatFilter)} aria-label="Filter by type">
          <option value="all">All types</option>
          <option value="slot">Slots</option>
          <option value="mini">Originals</option>
        </select>
        <select className="select select--sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
          <option value="sort">Sort: manual order</option>
          <option value="title">Sort: title A→Z</option>
          <option value="newest">Sort: newest</option>
          <option value="rtp">Sort: highest RTP</option>
        </select>
      </div>

      {err && <div className="msg msg--err" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="card grid-rows">
        <div className="row row__head">
          <span>Art</span><span>Title</span><span>Type</span><span>RTP</span><span>State</span><span style={{ textAlign: 'right' }}>Actions</span>
        </div>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <div className="skeleton skel-row" key={i} aria-hidden="true" />)
        ) : games.length === 0 ? (
          <div className="center-note">No games yet. Click <b>Import curated catalogue</b> to seed, or add one.</div>
        ) : visible.length === 0 ? (
          <div className="center-note">
            No games match your filters.
            <button className="link-btn" style={{ marginLeft: 8 }} onClick={() => { setQuery(''); setCat('all'); }}>Clear</button>
          </div>
        ) : visible.map((g) => (
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
          onSaved={(saved) => { setGames((prev) => prev.some((x) => x.id === saved.id) ? prev.map((x) => (x.id === saved.id ? saved : x)) : [...prev, saved]); setEditing(null); toast(`Saved "${saved.title}".`); }}
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
