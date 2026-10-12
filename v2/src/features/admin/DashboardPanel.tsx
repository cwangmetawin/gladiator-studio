import { useEffect, useState } from 'react';
import { fetchGameCount } from '@/api/catalogueDb';
import { fetchEnquiries, fetchEnquiryCount, type Enquiry } from '@/api/enquiriesDb';
import { RailCard } from './Rail';
import type { AdminDestination } from './adminNavigation';

interface DashboardStat {
  readonly label: string;
  readonly sub: string;
  readonly load: () => Promise<number>;
  readonly destination: AdminDestination;
  readonly highlight?: boolean;
}

const STATS: readonly DashboardStat[] = [
  {
    label: 'New enquiries', sub: 'need attention', highlight: true,
    load: () => fetchEnquiryCount({ handled: false }), destination: { tab: 'enquiries', filter: 'new' },
  },
  {
    label: 'Enquiries this week', sub: 'in the last 7 days', destination: { tab: 'enquiries', filter: 'all' },
    load: () => fetchEnquiryCount({ createdSince: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }),
  },
  { label: 'Live games', sub: 'published on the site', load: () => fetchGameCount(true), destination: { tab: 'games', state: 'live' } },
  { label: 'Hidden games', sub: 'not published', load: () => fetchGameCount(false), destination: { tab: 'games', state: 'hidden' } },
];

type CountState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly count: number }
  | { readonly status: 'error'; readonly message: string };

/** Each count can load and retry independently of the other cards. */
function StatCard({ stat, onNavigate }: { readonly stat: DashboardStat; readonly onNavigate: (destination: AdminDestination) => void }) {
  const [state, setState] = useState<CountState>({ status: 'loading' });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    void stat.load().then(
      (count) => { if (alive) setState({ status: 'ready', count }); },
      (error: unknown) => { if (alive) setState({ status: 'error', message: error instanceof Error ? error.message : 'Count could not be loaded.' }); },
    );
    return () => { alive = false; };
  }, [stat, retry]);

  const caption = <><span className="dash-card__label">{stat.label}</span><span className="dash-card__sub">{stat.sub}</span></>;
  if (state.status === 'loading') return (
    <div className="card dash-card" role="status" aria-label={`Loading ${stat.label}`} aria-busy="true">
      <span className="skeleton dash-card__skeleton" aria-hidden="true" />{caption}
    </div>
  );
  if (state.status === 'error') return (
    <div className="card dash-card">
      {caption}
      <div className="msg msg--err" role="alert">{state.message}</div>
      <button type="button" className="btn btn--sm" onClick={() => setRetry((n) => n + 1)} aria-label={`Retry ${stat.label}`}>Retry</button>
    </div>
  );
  return (
    <button type="button" className={`card dash-card ${stat.highlight && state.count > 0 ? 'dash-card--attention' : ''}`} onClick={() => onNavigate(stat.destination)}>
      <span className="dash-card__value">{state.count}</span>{caption}
    </button>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** At-a-glance overview — the admin landing screen. */
export function DashboardPanel({ onNavigate }: { readonly onNavigate: (destination: AdminDestination) => void }) {
  const [enquiries, setEnquiries] = useState<readonly Enquiry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setEnquiries(null); setError(null);
    void fetchEnquiries(5).then(
      (items) => { if (alive) setEnquiries(items); },
      (er: unknown) => { if (alive) setError(er instanceof Error ? er.message : 'Recent enquiries could not be loaded.'); },
    );
    return () => { alive = false; };
  }, [retry]);

  return (
    <div className="admin__layout">
      <div className="admin__primary">
        <div className="toolbar"><span className="toolbar__title">Dashboard</span></div>

        <div className="dash-grid">
          {STATS.map((stat) => <StatCard key={stat.label} stat={stat} onNavigate={onNavigate} />)}
        </div>

        <div className="card" style={{ padding: 18, marginTop: 16 }}>
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <span className="toolbar__title" style={{ fontSize: 15 }}>Recent enquiries</span>
            <div className="admin__spacer" />
            <button type="button" className="btn btn--sm" onClick={() => onNavigate({ tab: 'enquiries', filter: 'all' })}>View all</button>
          </div>
          {error ? (
            <div className="toolbar">
              <div className="msg msg--err" role="alert">{error}</div>
              <button type="button" className="btn btn--sm" onClick={() => setRetry((n) => n + 1)}>Retry recent enquiries</button>
            </div>
          ) : enquiries === null ? (
            <div className="grid-rows" role="status" aria-label="Loading recent enquiries" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => <div className="skeleton skel-row" key={i} aria-hidden="true" />)}
            </div>
          ) : enquiries.length === 0 ? (
            <div className="center-note">No enquiries yet — submissions from the contact form appear here.</div>
          ) : (
            <div className="grid-rows">
              {enquiries.map((e) => (
                <div className="row dash-row" key={e.id}>
                  <div>
                    <div className="row__title">{e.name || 'Anonymous'}{e.company && <span style={{ color: 'var(--a-mute)', fontWeight: 400 }}> · {e.company}</span>}</div>
                    <div className="row__sub">{e.email}</div>
                  </div>
                  <span className="enq__meta">
                    {!e.handled && <span className="tag tag--hot">New</span>}
                    <span className={`tag ${e.enquiryType.startsWith('[honeypot]') ? 'tag--hot' : ''}`}>{e.enquiryType.startsWith('[honeypot]') ? 'Suspected spam' : e.enquiryType || '—'}</span>
                  </span>
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
            <button type="button" className="btn btn--sm" onClick={() => onNavigate({ tab: 'games' })}>Manage catalogue</button>
            <button type="button" className="btn btn--sm" onClick={() => onNavigate({ tab: 'content' })}>Edit page content</button>
            <button type="button" className="btn btn--sm" onClick={() => onNavigate({ tab: 'enquiries', filter: 'new' })}>Review enquiries</button>
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
