import { useEffect, useRef, useState } from 'react';
import { Eyebrow, Divider } from '@/shared/ui';
import { useFeederSocket, type FeedEvent } from './useFeederSocket';

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties['fontFamily'] = 'var(--font-mono)';

// Token hex equivalents — used only inside runtime cssText template strings,
// where var() resolution against the element is not always reliable.
// Mirror of theme.css tokens; keep in sync.
const HOLO = '#4FC3F7'; // var(--color-holo-500)
const GOLD = '#FFD27A'; // var(--color-gold)
const ICE = '#C6D2E2'; // var(--color-ice-200)
const MUTE = '#8294AC'; // var(--color-text-mute)
const PURPLE = '#b39ddb'; // Originals accent (kept as-is)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** A small breathing status dot — live-green when connected, ember when offline. */
function LiveDot({ isConnected }: { readonly isConnected: boolean }) {
  const color = isConnected ? 'var(--color-live)' : 'var(--color-ember)';
  return (
    <span
      aria-hidden="true"
      className="animate-live-pulse"
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 8px ${color}`,
        flexShrink: 0,
      }}
    />
  );
}

interface StatPanelProps {
  readonly label: string;
  readonly value: string;
  readonly valueColor?: string;
}

/** Compact glass mini-stat card with a mono telemetry value over a Title Case label.
 * The border briefly glows whenever the value ticks — a live-terminal pulse. */
function StatPanel({ label, value, valueColor = 'var(--color-holo-500)' }: StatPanelProps) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 380);
    return () => window.clearTimeout(t);
  }, [value]);
  return (
    <div
      className="card"
      style={{
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 4,
        minHeight: 54,
        borderColor: flash ? 'rgba(79,195,247,0.55)' : undefined,
        boxShadow: flash ? 'inset 0 1px 0 var(--color-line-bright), 0 0 16px rgba(79,195,247,0.18)' : undefined,
        transition: 'border-color 0.4s var(--ease-out-expo), box-shadow 0.4s var(--ease-out-expo)',
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 'var(--text-2xs)',
          fontWeight: 500,
          letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase',
          color: 'var(--color-text-mute)',
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 16,
          fontWeight: 700,
          color: valueColor,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// FeedItem is created via direct DOM manipulation inside FeedPanel (feeder pattern)

interface FeedPanelProps {
  readonly title: string;
  readonly accentColor: string;
  readonly eventCount: number;
  readonly panelTotal: number;
  readonly events: readonly FeedEvent[];
  readonly emptyMessage: string;
  readonly isConnected: boolean;
}

/**
 * DOM-based feed panel — mirrors feeder DataFeed.ts exactly.
 * Uses direct DOM prepend/remove instead of React re-renders.
 */
function FeedPanel({
  title,
  accentColor,
  eventCount,
  panelTotal,
  events,
  emptyMessage,
  isConnected,
}: FeedPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemCountRef = useRef(0);
  const prevLenRef = useRef(0);

  // Direct DOM updates — prepend new items, remove oldest beyond MAX
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const newItems = events.slice(0, events.length - prevLenRef.current);
    prevLenRef.current = events.length;

    // Prepend each new event as a DOM node
    for (let i = newItems.length - 1; i >= 0; i--) {
      const ev = newItems[i];
      if (!ev) continue;
      const isGladiator = ev.provider === 'gladiator';
      const railColor = isGladiator ? HOLO : PURPLE;
      const isBigWin = ev.amount >= 100;

      const item = document.createElement('div');
      item.style.cssText = `
        display:flex;align-items:center;gap:8px;font-size:11px;
        min-height:24px;padding:2px 8px;border-radius:var(--radius-xs);
        font-family:${MONO};
        animation:feedFadeIn 0.3s ease-out;
        transition:background 0.18s ease;
      `;

      // Thin rail bar — gold for big wins, holo/purple otherwise
      const rail = document.createElement('span');
      rail.style.cssText = `
        width:3px;height:18px;border-radius:999px;flex:0 0 auto;
        background:${isBigWin ? GOLD : railColor};
      `;

      const amount = document.createElement('span');
      amount.style.cssText = `color:${isBigWin ? GOLD : HOLO};font-weight:700;min-width:58px;flex:0 0 auto;font-variant-numeric:tabular-nums;letter-spacing:0.02em;`;
      amount.textContent = formatUSD(ev.amount);

      const name = document.createElement('span');
      name.style.cssText = `color:${ICE};flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
      name.textContent = ev.gameName;
      name.title = ev.gameName;

      const loc = document.createElement('span');
      loc.style.cssText = `color:${MUTE};font-size:10px;flex:0 0 auto;min-width:16px;text-align:right;letter-spacing:0.08em;`;
      loc.textContent = ev.country;

      item.appendChild(rail);
      item.appendChild(amount);
      item.appendChild(name);
      item.appendChild(loc);

      // Subtle hover background
      item.addEventListener('mouseenter', () => { item.style.background = 'rgba(79,195,247,0.06)'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });

      list.prepend(item);
      itemCountRef.current++;
    }

    // Remove oldest — max items based on visible container height
    const maxItems = Math.max(5, Math.floor(list.clientHeight / 28));
    while (itemCountRef.current > maxItems && list.lastElementChild) {
      list.lastElementChild.remove();
      itemCountRef.current--;
    }
  }, [events]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          borderBottom: '1px solid var(--color-line)',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LiveDot isConnected={isConnected} />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.95rem',
              fontWeight: 600,
              letterSpacing: '-0.005em',
              color: accentColor,
            }}
          >
            {title}
          </span>
        </div>
        <div className="readout" style={{ gap: '0.9rem' }}>
          <span className="readout__value">{eventCount}</span>
          <span className="readout__value readout__value--gold">{formatUSD(panelTotal)}</span>
        </div>
      </div>

      {/* Feed list — flex:1 fills remaining space, overflow scrolls */}
      <div
        ref={listRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: 8,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(79,195,247,0.4) transparent',
        }}
        className="feed-scroll"
      >
        {events.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 16px',
              fontFamily: MONO,
              fontSize: 'var(--text-2xs)',
              color: 'var(--color-text-mute)',
              letterSpacing: '0.08em',
            }}
          >
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function LiveActivityFeed() {
  const {
    events,
    eventsPerSecond,
    totalAmount,
    isConnected,
    gladiatorCount,
    originalCount,
  } = useFeederSocket();

  const gladiatorEvents = events.filter(e => e.provider === 'gladiator').slice(0, 15);
  const originalEvents = events.filter(e => e.provider !== 'gladiator').slice(0, 15);

  // Approximate split for panel totals (gladiator ~40%, originals ~60%)
  const gladiatorTotal = totalAmount * 0.4;
  const originalTotal = totalAmount * 0.6;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        @keyframes feedFadeIn { 0%{opacity:0} 100%{opacity:1} }
        .feed-scroll::-webkit-scrollbar{width:4px}
        .feed-scroll::-webkit-scrollbar-track{background:transparent}
        .feed-scroll::-webkit-scrollbar-thumb{background:rgba(79,195,247,.4);border-radius:2px}
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 10, flexShrink: 0 }}>
        <Eyebrow dot>Live Telemetry</Eyebrow>
      </div>

      {/* Stats — compact single row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10, flexShrink: 0 }}>
        <StatPanel
          label="Status"
          value={isConnected ? 'Online' : 'Offline'}
          valueColor={isConnected ? 'var(--color-live)' : 'var(--color-ember)'}
        />
        <StatPanel label="Events/s" value={eventsPerSecond.toFixed(0)} />
        <StatPanel label="Wagered" value={formatUSD(totalAmount)} />
        <StatPanel label="Events" value={`${gladiatorCount + originalCount}`} />
      </div>

      <Divider />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, flex: 1, minHeight: 0, marginTop: 12 }}>
        <FeedPanel
          title="Gladiator"
          accentColor="var(--color-holo-300)"
          eventCount={gladiatorCount}
          panelTotal={gladiatorTotal}
          events={gladiatorEvents}
          emptyMessage="Awaiting Gladiator events…"
          isConnected={isConnected}
        />
        <FeedPanel
          title="Originals"
          accentColor={PURPLE}
          eventCount={originalCount}
          panelTotal={originalTotal}
          events={originalEvents}
          emptyMessage="Awaiting MetaWin events…"
          isConnected={isConnected}
        />
      </div>
    </div>
  );
}
