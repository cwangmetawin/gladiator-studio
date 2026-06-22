import React, { useState, useCallback } from 'react';
import type { Game } from '@/shared/types/game';
import { soundEngine } from '@/shared/utils/soundEngine';

function isSafeUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function FallbackCover({ title }: { readonly title: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: 16,
        background: 'linear-gradient(157deg, rgba(20,26,42,0.9), rgba(9,11,20,0.96))',
      }}
    >
      <span style={{ fontSize: 40, lineHeight: 1, opacity: 0.7 }}>🎰</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-text-mute)', textAlign: 'center', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {title}
      </span>
    </div>
  );
}

function CornerTag({ children, side, gold = false }: { readonly children: React.ReactNode; readonly side: 'left' | 'right'; readonly gold?: boolean }) {
  return (
    <span
      style={{
        position: 'absolute', top: 10, [side]: 10, zIndex: 20,
        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        padding: '3px 7px', borderRadius: 999,
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        ...(gold
          ? { background: 'var(--color-gold)', color: 'var(--color-void-900)' }
          : { background: 'rgba(8,12,22,0.6)', color: 'var(--color-holo-300)', border: '1px solid var(--color-line)' }),
      }}
    >
      {children}
    </span>
  );
}

function VolatilityBar({ volatility }: { readonly volatility: 'HIGH' | 'ULTRA' }) {
  const filled = volatility === 'ULTRA' ? 5 : 4;
  const color = volatility === 'ULTRA' ? 'var(--color-gold)' : 'var(--color-holo-500)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} aria-label={`Volatility ${volatility}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ width: 9, height: 4, borderRadius: 2, background: i < filled ? color : 'rgba(255,255,255,0.12)' }} />
      ))}
    </span>
  );
}

// ─── GameCard ───────────────────────────────────────────────────────────────────

interface GameCardProps {
  readonly game: Game;
  readonly onPlayGame: (game: Game) => void;
}

function GameCardComponent({ game, onPlayGame }: GameCardProps) {
  const [imageError, setImageError] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handlePlay = useCallback(() => {
    if (!isSafeUrl(game.link)) {
      console.warn(`GameCard: unsafe link blocked for "${game.title}"`);
      return;
    }
    soundEngine.transmission();
    window.dispatchEvent(new CustomEvent('play-game', { detail: { title: game.title, link: game.link } }));
    onPlayGame(game);
  }, [game, onPlayGame]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handlePlay();
    }
  }, [handlePlay]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Play ${game.title}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onKeyDown={handleKeyDown}
      onClick={handlePlay}
      style={{
        display: 'flex', flexDirection: 'column',
        borderRadius: 'var(--radius-md)', overflow: 'hidden', cursor: 'pointer',
        background: 'linear-gradient(157deg, rgba(20,26,42,0.55), rgba(9,11,20,0.7))',
        border: `1px solid ${hovered ? 'rgba(79,195,247,0.4)' : 'var(--color-line)'}`,
        boxShadow: hovered
          ? 'inset 0 1px 0 var(--color-line-bright), 0 16px 36px -16px rgba(0,0,0,0.7), var(--shadow-glow)'
          : 'inset 0 1px 0 var(--color-line-bright), 0 8px 24px -12px rgba(0,0,0,0.6)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'transform var(--dur) var(--ease-out-expo), box-shadow var(--dur) var(--ease-out-expo), border-color var(--dur) var(--ease-out-expo)',
      }}
    >
      {/* Cover */}
      <div style={{ position: 'relative', aspectRatio: '3 / 4', overflow: 'hidden', background: 'var(--color-void-900)' }}>
        {(!game.image || imageError) ? (
          <FallbackCover title={game.title} />
        ) : (
          <img
            src={game.image}
            alt=""
            loading="lazy"
            width={300} height={400}
            onError={() => setImageError(true)}
            draggable={false}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center',
              transform: hovered ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform var(--dur-slow) var(--ease-out-expo)',
            }}
          />
        )}

        {/* Legibility gradient */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(5,6,10,0.85) 0%, transparent 55%)', pointerEvents: 'none' }} />

        <CornerTag side="left">{game.category === 'slot' ? 'Gladiator' : 'MetaWin'}</CornerTag>
        {game.isHot && <CornerTag side="right" gold>Hot</CornerTag>}

        {/* Hover overlay */}
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 16,
            background: 'rgba(5,8,16,0.82)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            opacity: hovered ? 1 : 0, pointerEvents: hovered ? 'auto' : 'none',
            transition: 'opacity var(--dur) var(--ease-out-expo)',
          }}
        >
          <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-text-soft)', fontSize: 12, lineHeight: 1.55, textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: 0 }}>
            {game.description}
          </p>
          <span className="btn btn--primary" aria-hidden="true">Play Demo</span>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '11px 13px 13px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--color-ice-50)', fontSize: 14, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
          {game.title}
        </p>
        {(game.volatility || game.rtp != null) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 12 }}>
            {game.volatility ? <VolatilityBar volatility={game.volatility} /> : <span />}
            {game.rtp != null && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--color-gold)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                RTP {game.rtp}%
              </span>
            )}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {game.genre && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-mute)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-line)' }}>
              {game.genre}
            </span>
          )}
          {game.volatility === 'ULTRA' && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-gold)' }}>Ultra</span>
          )}
        </div>
      </div>
    </div>
  );
}

export const GameCard = React.memo(GameCardComponent);
