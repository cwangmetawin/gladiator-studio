import { useEffect, useState } from 'react';
import { fetchAllGames } from '@/api/catalogueDb';
import { fetchEnquiries, type Enquiry } from '@/api/enquiriesDb';
import { SECTIONS } from '@/api/siteContent';
import { useToast } from './Toast';
import { RailCard } from './Rail';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** At-a-glance overview — the admin landing screen. */
export function DashboardPanel({ onNavigate }: { readonly onNavigate: (tab: 'games' | 'content' | 'enquiries') => void }) {
  const { toast } = useToast();
  const [games, setGames] = useState<{ total: number; live: number } | null>(null);
  const [enquiries, setEnquiries] = useState<readonly Enquiry[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [g, e] = await Promise.all([fetchAllGames(), fetchEnquiries()]);
        if (!alive) return;
        setGames({ total: g.length, live: g.filter((x) => x.isPublished).length });
        setEnquiries(e);
      } catch (er) { if (alive) toast(er instanceof Error ? er.message : 'Failed to load dashboard', 'err'); }
    })();
    return () => { alive = false; };
  }, [toast]);

  const stats: readonly { label: string; value: number | string; sub: string; tab: 'games' | 'content' | 'enquiries' }[] = [
    { label: 'Games', value: games?.total ?? '—', sub: 'in catalogue', tab: 'games' },
    { label: 'Live', value: games?.live ?? '—', sub: 'published', tab: 'games' },
    { label: 'Content pages', value: SECTIONS.length, sub: 'editable', tab: 'content' },
    { label: 'Enquiries', value: enquiries?.length ?? '—', sub: 'total received', tab: 'enquiries' },
  ];

  return (
    <div className="admin__layout">
      <div className="admin__primary">
        <div className="toolbar"><span className="toolbar__title">Dashboard</span></div>

        <div className="dash-grid">
          {stats.map((s) => (
            <button key={s.label} type="button" className="card dash-card" onClick={() => onNavigate(s.tab)}>
              <span className="dash-card__value">{s.value}</span>
              <span className="dash-card__label">{s.label}</span>
              <span className="dash-card__sub">{s.sub}</span>
            </button>
          ))}
        </div>

        <div className="card" style={{ padding: 18, marginTop: 16 }}>
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <span className="toolbar__title" style={{ fontSize: 15 }}>Recent enquiries</span>
            <div className="admin__spacer" />
            <button type="button" className="btn btn--sm" onClick={() => onNavigate('enquiries')}>View all</button>
          </div>
          {enquiries === null ? (
            <div className="center-note">Loading…</div>
          ) : enquiries.length === 0 ? (
            <div className="center-note">No enquiries yet — submissions from the contact form appear here.</div>
          ) : (
            <div className="grid-rows">
              {enquiries.slice(0, 5).map((e) => (
                <div className="row dash-row" key={e.id}>
                  <div>
                    <div className="row__title">{e.name || 'Anonymous'}{e.company && <span style={{ color: 'var(--a-mute)', fontWeight: 400 }}> · {e.company}</span>}</div>
                    <div className="row__sub">{e.email}</div>
                  </div>
                  <span className="tag">{e.enquiryType || '—'}</span>
                  <span className="row__sub">{fmtDate(e.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <aside className="admin__rail">
        <RailCard title="Quick actions">
          <div className="rail-card__actions">
            <button type="button" className="btn btn--sm" onClick={() => onNavigate('games')}>Manage catalogue</button>
            <button type="button" className="btn btn--sm" onClick={() => onNavigate('content')}>Edit page content</button>
            <button type="button" className="btn btn--sm" onClick={() => onNavigate('enquiries')}>Review enquiries</button>
            <a className="btn btn--sm btn--primary" href="/" target="_blank" rel="noopener noreferrer">Open live site ↗</a>
          </div>
        </RailCard>

        <RailCard title="Support">
          <div className="rail-card__body">
            Edit any section under <b>Content</b> — changes go live instantly. Manage games and visibility under <b>Catalogue</b>.
            <div style={{ marginTop: 10 }}>
              <a className="rail-link" href="https://www.gladiatorstudios.co.uk" target="_blank" rel="noopener noreferrer">gladiatorstudios.co.uk ↗</a>
            </div>
          </div>
        </RailCard>
      </aside>
    </div>
  );
}
