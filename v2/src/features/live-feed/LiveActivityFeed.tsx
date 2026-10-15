import { useEffect, useMemo, useState } from 'react';
import { ARENA_PAGE_COPY } from '@/features/arena-page/pageCopy';
import { ArenaPageContent } from '@/features/arena-page/ArenaPageContent';
import { EditorialChapter, EditorialCounter, EditorialIndex } from '@/features/arena-page/Editorial';
import type { FeedEvent, FeederState } from './useFeederSocket';
import { lookupGame } from './liveCatalogue';

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function FeedRows({ id, number, title, events, count, total, connected }: {
  readonly id: string; readonly number: string;
  readonly title: string; readonly events: readonly FeedEvent[]; readonly count: number;
  readonly total: number; readonly connected: boolean;
}) {
  return <EditorialChapter id={id} number={number} kicker="Live ledger" title={title} className="editorial-chapter--feed">
    <p className="arena-page__meta">{count} events · {formatUSD(total)}</p>
    <div role="log" aria-label={`${title} activity`} aria-live="polite" aria-relevant="additions text">
      <ol className="arena-page__rows arena-page__feed">{events.map(event => <li key={event.id}>
        <span className="arena-page__feed-title">{lookupGame(event.gameName)?.title ?? event.gameName}</span><strong>{formatUSD(event.amount)}</strong>
        <span className="arena-page__meta">{event.country}</span><span className="arena-page__meta">{event.amount >= 1000 ? 'MEGA' : event.amount >= 100 ? 'BIG' : ''}</span>
      </li>)}</ol>
      {!events.length && <p>{connected ? `Awaiting ${title} events…` : 'Feed offline — reconnecting…'}</p>}
    </div>
  </EditorialChapter>;
}

/** App owns the only socket; these bounded lists render that same feed and session totals. */
export function LiveActivityFeed({ titleId, bodyOnly = false, events, isConnected, eventsPerSecond, totalAmount, gladiatorCount, originalCount, gladiatorTotal, originalTotal }: FeederState & { readonly titleId: string; readonly bodyOnly?: boolean }) {
  const [topWin, setTopWin] = useState<FeedEvent | null>(null);
  const localMax = useMemo(() => events.reduce<FeedEvent | null>((best, event) => !best || event.amount > best.amount ? event : best, null), [events]);
  useEffect(() => { if (localMax && (!topWin || localMax.amount >= topWin.amount)) setTopWin(localMax); }, [localMax, topWin]);
  const spotlight = topWin ?? events[0] ?? null;
  return <ArenaPageContent titleId={titleId} bodyOnly={bodyOnly} {...ARENA_PAGE_COPY.live}>
    <EditorialIndex chapters={[{ id: 'live-session', label: 'Session' }, { id: 'live-record', label: 'Biggest win' },
      { id: 'live-gladiator', label: 'Gladiator' }, { id: 'live-originals', label: 'Originals' }]} />
    <EditorialChapter id="live-session" number="01" kicker="Live" title="Session">
      <p className="arena-page__live-status"><span className="arena-page__live-dot" data-connected={isConnected} aria-hidden="true" />{isConnected ? 'Online' : 'Offline'}</p>
      <div className="editorial-counter-strip">
        <EditorialCounter value={eventsPerSecond} label="Events/s" />
        <div className="editorial-counter"><span className="editorial-counter__value">{formatUSD(totalAmount)}</span><span className="arena-page__meta">Wagered</span></div>
        <EditorialCounter value={gladiatorCount + originalCount} label="Events" />
      </div>
    </EditorialChapter>
    <EditorialChapter id="live-record" number="02" kicker="Biggest win" title={spotlight ? lookupGame(spotlight.gameName)?.title ?? spotlight.gameName : 'Awaiting a big win…'}>
      <p className="arena-page__number arena-page__win-amount">{spotlight ? formatUSD(spotlight.amount) : '—'}</p>
      {spotlight && <p className="arena-page__meta">{spotlight.provider === 'gladiator' ? 'Gladiator' : 'Original'} · {spotlight.country}</p>}
    </EditorialChapter>
    <FeedRows id="live-gladiator" number="03" title="Gladiator" events={events.filter(event => event.provider === 'gladiator').slice(0, 15)} count={gladiatorCount} total={gladiatorTotal} connected={isConnected} />
    <FeedRows id="live-originals" number="04" title="Originals" events={events.filter(event => event.provider !== 'gladiator').slice(0, 15)} count={originalCount} total={originalTotal} connected={isConnected} />
  </ArenaPageContent>;
}
