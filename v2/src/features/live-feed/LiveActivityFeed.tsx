import { useEffect, useMemo, useRef, useState } from 'react';
import { Eyebrow, Divider } from '@/shared/ui';
import { useFeederSocket, type FeedEvent } from './useFeederSocket';
import { lookupGame } from './liveCatalogue';

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties['fontFamily'] = 'var(--font-mono)';

// Token hex equivalents — used only inside runtime cssText template strings,
// where var() resolution against the element is not always reliable.
// Mirror of theme.css tokens; keep in sync.
const HOLO = '#4FC3F7'; // var(--color-holo-500)
const GOLD = '#FFD27A'; // var(--color-gold)
const ICE = '#C6D2E2'; // var(--color-ice-200)
const MUTE = '#8294AC'; // var(--color-text-mute)
const PURPLE = '#b39ddb'; // Originals accent

// Win tiers — drive the gold glow + tag on bigger wins.
const MEGA = 1000; // $1k+
const BIG = 100; //   $100+

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
      style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }}
    />
  );
}

interface StatPanelProps {
  readonly label: string;
  readonly value: string;
  readonly valueColor?: string;
}

/** Compact glass mini-stat card with a mono telemetry value; border glows on tick. */
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
        padding: '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 4, minHeight: 54,
        borderColor: flash ? 'rgba(79,195,247,0.55)' : undefined,
        boxShadow: flash ? 'inset 0 1px 0 var(--color-line-bright), 0 0 16px rgba(79,195,247,0.18)' : undefined,
        transition: 'border-color 0.4s var(--ease-out-expo), box-shadow 0.4s var(--ease-out-expo)',
      }}
    >
      <span style={{ fontFamily: MONO, fontSize: 'var(--text-2xs)', fontWeight: 500, letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--color-text-mute)', lineHeight: 1.2 }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: valueColor, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

/** Cinematic biggest-win spotlight — game art behind a huge gold payout that
 *  flares whenever a new session record lands. The "酷炫" centrepiece. */
function BigWinSpotlight({ win }: { readonly win: FeedEvent | null }) {
  const [flash, setFlash] = useState(false);
  const prevId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!win || win.id === prevId.current) return;
    prevId.current = win.id;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 900);
    return () => window.clearTimeout(t);
  }, [win]);

  const entry = win ? lookupGame(win.gameName) : undefined;
  const isGladiator = win?.provider === 'gladiator';
  const accent = isGladiator ? HOLO : PURPLE;

  return (
    <div
      className="card live-spotlight"
      style={{
        position: 'relative', overflow: 'hidden', padding: 0, minHeight: 96, flexShrink: 0,
        borderColor: flash ? 'rgba(255,210,122,0.7)' : undefined,
        boxShadow: flash ? '0 0 34px -4px rgba(255,210,122,0.5), inset 0 0 0 1px rgba(255,210,122,0.45)' : undefined,
        transition: 'border-color 0.6s var(--ease-out-expo), box-shadow 0.6s var(--ease-out-expo)',
      }}
    >
      {entry?.image && (
        <img
          src={entry.image}
          alt=""
          aria-hidden="true"
          className={flash ? 'live-spotlight__art is-flash' : 'live-spotlight__art'}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 28%' }}
        />
      )}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, rgba(8,10,16,0.94) 0%, rgba(8,10,16,0.66) 46%, rgba(8,10,16,0.12) 100%), linear-gradient(0deg, rgba(8,10,16,0.55), transparent 72%)` }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', minHeight: 96 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 'var(--text-2xs)', letterSpacing: '0.18em', textTransform: 'uppercase', color: GOLD }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, boxShadow: `0 0 8px ${GOLD}` }} />
            Biggest Win
          </span>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-ice-50)', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
            {win ? (entry?.title ?? win.gameName) : 'Awaiting a big win…'}
          </div>
          {win && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em' }}>
              <span style={{ color: accent, textTransform: 'uppercase' }}>{isGladiator ? 'Gladiator' : 'Original'}</span>
              <span style={{ color: MUTE }}>{win.country}</span>
            </div>
          )}
        </div>
        <div
          className={flash ? 'live-spotlight__amount is-flash' : 'live-spotlight__amount'}
          style={{ fontFamily: MONO, fontWeight: 800, fontSize: 'clamp(24px, 4.4vw, 38px)', color: GOLD, fontVariantNumeric: 'tabular-nums', textShadow: '0 0 24px rgba(255,210,122,0.55)', flexShrink: 0, lineHeight: 1 }}
        >
          {win ? formatUSD(win.amount) : '—'}
        </div>
      </div>
    </div>
  );
}

interface FeedPanelProps {
  readonly title: string;
  readonly accentColor: string;
  readonly eventCount: number;
  readonly panelTotal: number;
  readonly events: readonly FeedEvent[];
  readonly emptyMessage: string;
  readonly isConnected: boolean;
}

/** DOM-based feed panel — prepends new rows directly (feeder pattern) for speed.
 *  Each row now carries the game's catalogue thumbnail + a tiered gold treatment. */
function FeedPanel({ title, accentColor, eventCount, panelTotal, events, emptyMessage, isConnected }: FeedPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemCountRef = useRef(0);
  const prevLenRef = useRef(0);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const newItems = events.slice(0, events.length - prevLenRef.current);
    prevLenRef.current = events.length;

    for (let i = newItems.length - 1; i >= 0; i--) {
      const ev = newItems[i];
      if (!ev) continue;
      const entry = lookupGame(ev.gameName);
      const isGladiator = ev.provider === 'gladiator';
      const railColor = isGladiator ? HOLO : PURPLE;
      const tier = ev.amount >= MEGA ? 'mega' : ev.amount >= BIG ? 'big' : 'normal';
      const isWin = tier !== 'normal';

      const item = document.createElement('div');
      item.style.cssText = `
        position:relative;display:flex;align-items:center;gap:8px;font-size:11px;
        min-height:32px;padding:4px 8px;border-radius:var(--radius-xs);
        font-family:${MONO};animation:feedFadeIn 0.3s ease-out;transition:background 0.18s ease;
        ${isWin ? `background:linear-gradient(90deg, rgba(255,210,122,0.14), rgba(255,210,122,0.02) 70%);box-shadow:inset 0 0 0 1px rgba(255,210,122,0.18);` : ''}
      `;

      // Game thumbnail from the catalogue (fallback to a tinted monogram tile).
      const thumb = document.createElement('div');
      thumb.style.cssText = `width:26px;height:26px;flex:0 0 auto;border-radius:6px;overflow:hidden;background:linear-gradient(150deg, rgba(79,195,247,0.18), rgba(15,18,28,0.6));display:grid;place-items:center;border:1px solid var(--color-line);`;
      if (entry?.image) {
        const img = document.createElement('img');
        img.src = entry.image;
        img.alt = '';
        img.loading = 'lazy';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        img.addEventListener('error', () => { img.remove(); thumb.textContent = (entry.title || ev.gameName).charAt(0).toUpperCase(); thumb.style.color = railColor; thumb.style.fontWeight = '700'; });
        thumb.appendChild(img);
      } else {
        thumb.textContent = (ev.gameName || '?').charAt(0).toUpperCase();
        thumb.style.color = railColor;
        thumb.style.fontWeight = '700';
      }

      const rail = document.createElement('span');
      rail.style.cssText = `width:3px;height:20px;border-radius:999px;flex:0 0 auto;background:${isWin ? GOLD : railColor};${tier === 'mega' ? `box-shadow:0 0 8px ${GOLD};` : ''}`;

      const amount = document.createElement('span');
      amount.style.cssText = `color:${isWin ? GOLD : HOLO};font-weight:700;min-width:58px;flex:0 0 auto;font-variant-numeric:tabular-nums;letter-spacing:0.02em;${tier === 'mega' ? 'text-shadow:0 0 12px rgba(255,210,122,0.6);' : ''}`;
      amount.textContent = formatUSD(ev.amount);

      const name = document.createElement('span');
      name.style.cssText = `color:${ICE};flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
      name.textContent = entry?.title ?? ev.gameName;
      name.title = entry?.title ?? ev.gameName;

      const meta = document.createElement('span');
      meta.style.cssText = `color:${MUTE};font-size:10px;flex:0 0 auto;text-align:right;letter-spacing:0.08em;display:flex;align-items:center;gap:6px;`;
      if (tier === 'mega') {
        const tag = document.createElement('span');
        tag.textContent = 'MEGA';
        tag.style.cssText = `color:#0b0c12;background:${GOLD};font-weight:800;font-size:8px;letter-spacing:0.1em;padding:1px 5px;border-radius:4px;`;
        meta.appendChild(tag);
      }
      const loc = document.createElement('span');
      loc.textContent = ev.country;
      meta.appendChild(loc);

      item.appendChild(thumb);
      item.appendChild(rail);
      item.appendChild(amount);
      item.appendChild(name);
      item.appendChild(meta);

      item.addEventListener('mouseenter', () => { if (!isWin) item.style.background = 'rgba(79,195,247,0.06)'; });
      item.addEventListener('mouseleave', () => { if (!isWin) item.style.background = 'transparent'; });

      list.prepend(item);
      itemCountRef.current++;
    }

    const maxItems = Math.max(5, Math.floor(list.clientHeight / 34));
    while (itemCountRef.current > maxItems && list.lastElementChild) {
      list.lastElementChild.remove();
      itemCountRef.current--;
    }
  }, [events]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ borderBottom: '1px solid var(--color-line)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LiveDot isConnected={isConnected} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 600, letterSpacing: '-0.005em', color: accentColor }}>{title}</span>
        </div>
        <div className="readout" style={{ gap: '0.9rem' }}>
          <span className="readout__value">{eventCount}</span>
          <span className="readout__value readout__value--gold">{formatUSD(panelTotal)}</span>
        </div>
      </div>

      <div
        ref={listRef}
        className="feed-scroll"
        style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 8, scrollbarWidth: 'thin', scrollbarColor: 'rgba(79,195,247,0.4) transparent' }}
      >
        {events.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 16px', fontFamily: MONO, fontSize: 'var(--text-2xs)', color: 'var(--color-text-mute)', letterSpacing: '0.08em' }}>{emptyMessage}</div>
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function LiveActivityFeed() {
  const { events, eventsPerSecond, totalAmount, isConnected, gladiatorCount, originalCount } = useFeederSocket();

  const gladiatorEvents = events.filter((e) => e.provider === 'gladiator').slice(0, 15);
  const originalEvents = events.filter((e) => e.provider !== 'gladiator').slice(0, 15);

  const gladiatorTotal = totalAmount * 0.4;
  const originalTotal = totalAmount * 0.6;

  // Track the session's biggest win for the spotlight (climbs as bigger wins land).
  const [topWin, setTopWin] = useState<FeedEvent | null>(null);
  const localMax = useMemo(() => events.reduce<FeedEvent | null>((best, e) => (!best || e.amount > best.amount ? e : best), null), [events]);
  useEffect(() => {
    if (localMax && (!topWin || localMax.amount >= topWin.amount)) setTopWin(localMax);
  }, [localMax, topWin]);
  const spotlightWin = topWin ?? events[0] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        @keyframes feedFadeIn { 0%{opacity:0;transform:translateY(-3px)} 100%{opacity:1;transform:none} }
        @keyframes spotPulse { 0%{transform:scale(1.06)} 100%{transform:scale(1.12)} }
        @keyframes amountPop { 0%{transform:scale(1.18)} 60%{transform:scale(0.98)} 100%{transform:scale(1)} }
        .feed-scroll::-webkit-scrollbar{width:4px}
        .feed-scroll::-webkit-scrollbar-track{background:transparent}
        .feed-scroll::-webkit-scrollbar-thumb{background:rgba(79,195,247,.4);border-radius:2px}
        .live-spotlight__art{transform:scale(1.06);transition:transform 0.9s var(--ease-out-expo);opacity:0.72;filter:saturate(1.15)}
        .live-spotlight__art.is-flash{animation:spotPulse 0.9s var(--ease-out-expo)}
        .live-spotlight__amount{display:inline-block}
        .live-spotlight__amount.is-flash{animation:amountPop 0.6s var(--ease-out-expo)}
      `}</style>

      <div style={{ marginBottom: 10, flexShrink: 0 }}>
        <Eyebrow dot>Live Telemetry</Eyebrow>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10, flexShrink: 0 }}>
        <StatPanel label="Status" value={isConnected ? 'Online' : 'Offline'} valueColor={isConnected ? 'var(--color-live)' : 'var(--color-ember)'} />
        <StatPanel label="Events/s" value={eventsPerSecond.toFixed(0)} />
        <StatPanel label="Wagered" value={formatUSD(totalAmount)} />
        <StatPanel label="Events" value={`${gladiatorCount + originalCount}`} />
      </div>

      <BigWinSpotlight win={spotlightWin} />

      <Divider />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, flex: 1, minHeight: 0, marginTop: 12 }}>
        <FeedPanel title="Gladiator" accentColor="var(--color-holo-300)" eventCount={gladiatorCount} panelTotal={gladiatorTotal} events={gladiatorEvents} emptyMessage="Awaiting Gladiator events…" isConnected={isConnected} />
        <FeedPanel title="Originals" accentColor={PURPLE} eventCount={originalCount} panelTotal={originalTotal} events={originalEvents} emptyMessage="Awaiting MetaWin events…" isConnected={isConnected} />
      </div>
    </div>
  );
}
