import { useEffect, useMemo, useState } from 'react';
import { ARENA_PAGE_COPY } from '@/features/arena-page/pageCopy';
import { ArenaPageContent } from '@/features/arena-page/ArenaPageContent';
import type { FeedEvent, FeederState } from './useFeederSocket';
import { lookupGame } from './liveCatalogue';

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function FeedRows({ title, events, count, total, connected }: {
  readonly title: string; readonly events: readonly FeedEvent[]; readonly count: number;
  readonly total: number; readonly connected: boolean;
}) {
  return <section className="arena-page__section"><h2>{title}</h2>
    <p className="arena-page__meta">{count} events · {formatUSD(total)}</p>
    <div role="log" aria-label={`${title} activity`} aria-live="polite" aria-relevant="additions text">
      <ol className="arena-page__rows arena-page__feed">{events.map(event => <li key={event.id}>
        <span>{lookupGame(event.gameName)?.title ?? event.gameName}</span><strong>{formatUSD(event.amount)}</strong>
        <span className="arena-page__meta">{event.country}</span><span className="arena-page__meta">{event.amount >= 1000 ? 'MEGA' : event.amount >= 100 ? 'BIG' : ''}</span>
      </li>)}</ol>
      {!events.length && <p>{connected ? `Awaiting ${title} events…` : 'Feed offline — reconnecting…'}</p>}
    </div>
  </section>;
}

/** App owns the only socket; these bounded lists render that same feed and session totals. */
export function LiveActivityFeed({ titleId, bodyOnly = false, events, isConnected, eventsPerSecond, totalAmount, gladiatorCount, originalCount, gladiatorTotal, originalTotal }: FeederState & { readonly titleId: string; readonly bodyOnly?: boolean }) {
  const [topWin, setTopWin] = useState<FeedEvent | null>(null);
  const localMax = useMemo(() => events.reduce<FeedEvent | null>((best, event) => !best || event.amount > best.amount ? event : best, null), [events]);
  useEffect(() => { if (localMax && (!topWin || localMax.amount >= topWin.amount)) setTopWin(localMax); }, [localMax, topWin]);
  const spotlight = topWin ?? events[0] ?? null;
  return <ArenaPageContent titleId={titleId} bodyOnly={bodyOnly} {...ARENA_PAGE_COPY.live}>
    <section className="arena-page__section"><dl className="arena-page__stats">
      <div><dt>Status</dt><dd>{isConnected ? 'Online' : 'Offline'}</dd></div><div><dt>Events/s</dt><dd>{eventsPerSecond.toFixed(0)}</dd></div>
      <div><dt>Wagered</dt><dd>{formatUSD(totalAmount)}</dd></div><div><dt>Events</dt><dd>{gladiatorCount + originalCount}</dd></div>
    </dl></section>
    <section className="arena-page__section"><p className="arena-page__meta">Biggest Win</p><h2>{spotlight ? lookupGame(spotlight.gameName)?.title ?? spotlight.gameName : 'Awaiting a big win…'}</h2>
      <p className="arena-page__number">{spotlight ? formatUSD(spotlight.amount) : '—'}</p>
      {spotlight && <p className="arena-page__meta">{spotlight.provider === 'gladiator' ? 'Gladiator' : 'Original'} · {spotlight.country}</p>}
    </section>
    <div className="arena-page__columns">
      <FeedRows title="Gladiator" events={events.filter(event => event.provider === 'gladiator').slice(0, 15)} count={gladiatorCount} total={gladiatorTotal} connected={isConnected} />
      <FeedRows title="Originals" events={events.filter(event => event.provider !== 'gladiator').slice(0, 15)} count={originalCount} total={originalTotal} connected={isConnected} />
    </div>
  </ArenaPageContent>;
}
