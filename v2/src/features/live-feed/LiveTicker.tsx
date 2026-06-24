import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FeedEvent } from './useFeederSocket';
import { lookupGame } from './liveCatalogue';

// ─── Homepage live ticker ───────────────────────────────────────────────────
// A seamless horizontal crawl of real win events streaming across the bottom of
// the cosmic hero — game art + payout + country, flowing right→left. Big wins
// flare gold. The same socket also beams these wins onto the 3D globe.

const GOLD = '#FFD27A';
const HOLO = '#4FC3F7';
const PURPLE = '#b39ddb';

const BIG = 100;       // $100+ glows gold
const WINDOW = 18;     // chips per loop (kept ~constant so the loop stays seamless)

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function Chip({ ev }: { readonly ev: FeedEvent }) {
  const entry = lookupGame(ev.gameName);
  const big = ev.amount >= BIG;
  const accent = ev.provider === 'gladiator' ? HOLO : PURPLE;
  return (
    <span className="ticker__item">
      <span className="ticker__thumb" style={{ color: accent }}>
        {entry?.image
          ? <img src={entry.image} alt="" decoding="async" loading="lazy" />
          : (entry?.title ?? ev.gameName).charAt(0).toUpperCase()}
      </span>
      <span className="ticker__game">{entry?.title ?? ev.gameName}</span>
      <span className="ticker__amt" style={big ? { color: GOLD, textShadow: '0 0 12px rgba(255,210,122,0.5)' } : undefined}>
        {formatUSD(ev.amount)}
      </span>
      <span className="ticker__loc">{ev.country}</span>
      <span className="ticker__sep" aria-hidden="true">◆</span>
    </span>
  );
}

// The animated track is isolated behind React.memo so App's ~15/s socket-driven
// re-renders never reconcile the scrolling DOM — the compositor runs undisturbed.
const TickerTrack = memo(function TickerTrack({ chips, durationSec, onIter }: {
  readonly chips: readonly ReactNode[];
  readonly durationSec: number;
  readonly onIter: () => void;
}) {
  return (
    <div className="ticker__track" style={{ animationDuration: `${durationSec}s` }} onAnimationIteration={onIter}>
      {chips}
      {chips}
    </div>
  );
});

interface LiveTickerProps {
  /** Live events from App's shared feeder socket — never open a second socket. */
  readonly events: readonly FeedEvent[];
  readonly isConnected: boolean;
}

export function LiveTicker({ events, isConnected }: LiveTickerProps) {
  // Snapshot the marquee content and only refresh it at a loop boundary
  // (onAnimationIteration), so chips never swap mid-screen — perfectly seamless.
  const [snapshot, setSnapshot] = useState<readonly FeedEvent[]>([]);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  useEffect(() => {
    if (snapshot.length === 0 && events.length > 0) setSnapshot(events.slice(0, WINDOW));
  }, [events, snapshot.length]);

  const refresh = useCallback(() => {
    const latest = eventsRef.current.slice(0, WINDOW);
    if (latest.length) setSnapshot(latest);
  }, []);

  // Constant scroll speed regardless of how many chips are in the window.
  const durationSec = Math.max(22, snapshot.length * 1.7);
  const chips = useMemo(
    () => snapshot.map((ev) => <Chip key={ev.id} ev={ev} />),
    [snapshot],
  );

  if (snapshot.length === 0) return null;

  return (
    <div className="ticker" role="marquee" aria-label="Live wins ticker">
      <style>{`
        .ticker {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
          height: 38px; display: flex; align-items: center;
          /* No backdrop-filter: blurring the live WebGL starfield every frame
             stutters the scroll. A solid-ish gradient gives the same legibility. */
          background: linear-gradient(180deg, rgba(6,8,14,0) 0%, rgba(6,8,14,0.82) 42%, rgba(6,8,14,0.96) 100%);
          border-top: 1px solid rgba(79,195,247,0.16);
          overflow: hidden; pointer-events: auto;
        }
        .ticker__badge {
          flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px;
          height: 100%; padding: 0 14px;
          font-family: var(--font-mono); font-size: 10px; font-weight: 700;
          letter-spacing: 0.22em; text-transform: uppercase; color: var(--color-ice-50);
          background: linear-gradient(90deg, rgba(6,8,14,0.96), rgba(6,8,14,0.6));
          border-right: 1px solid rgba(79,195,247,0.18); z-index: 2; white-space: nowrap;
        }
        .ticker__dot { width: 7px; height: 7px; border-radius: 50%; box-shadow: 0 0 8px currentColor; }
        .ticker__viewport { flex: 1; min-width: 0; overflow: hidden;
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); }
        .ticker__track { display: flex; align-items: center; width: max-content;
          will-change: transform; backface-visibility: hidden;
          animation-name: tickerScroll; animation-timing-function: linear; animation-iteration-count: infinite; }
        .ticker:hover .ticker__track { animation-play-state: paused; }
        @keyframes tickerScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .ticker__item { display: inline-flex; align-items: center; gap: 8px; padding: 0 4px;
          font-family: var(--font-mono); font-size: 11.5px; white-space: nowrap; }
        .ticker__thumb { width: 20px; height: 20px; flex: 0 0 auto; border-radius: 5px; overflow: hidden;
          display: grid; place-items: center; font-weight: 700; font-size: 10px;
          background: linear-gradient(150deg, rgba(79,195,247,0.18), rgba(15,18,28,0.6)); border: 1px solid var(--color-line); }
        .ticker__thumb img { width: 100%; height: 100%; object-fit: cover; }
        .ticker__game { color: var(--color-ice-200); }
        .ticker__amt { color: ${HOLO}; font-weight: 700; font-variant-numeric: tabular-nums; }
        .ticker__loc { color: var(--color-text-mute); font-size: 10px; letter-spacing: 0.08em; }
        .ticker__sep { color: rgba(79,195,247,0.4); font-size: 7px; padding: 0 6px; }
        @media (prefers-reduced-motion: reduce) { .ticker__track { animation: none; } }
      `}</style>
      <div className="ticker__badge">
        <span className="ticker__dot animate-live-pulse" style={{ color: isConnected ? 'var(--color-live)' : 'var(--color-ember)', background: isConnected ? 'var(--color-live)' : 'var(--color-ember)' }} />
        Live Wins
      </div>
      <div className="ticker__viewport">
        <TickerTrack chips={chips} durationSec={durationSec} onIter={refresh} />
      </div>
    </div>
  );
}
