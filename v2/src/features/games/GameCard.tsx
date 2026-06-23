import React, { useState, useCallback } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate } from 'framer-motion';
import type { Game } from '@/shared/types/game';
import { soundEngine } from '@/shared/utils/soundEngine';

const TILT_SPRING = { stiffness: 160, damping: 18, mass: 0.5 } as const;

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
  readonly index?: number;
}

function GameCardComponent({ game, onPlayGame, index = 0 }: GameCardProps) {
  const [imageError, setImageError] = useState(false);
  const [hovered, setHovered] = useState(false);

  // ── Cursor-tracked 3D tilt + glare ──────────────────────────────────────────
  // mx/my are the normalized cursor position over the card (0..1). The card tilts
  // toward the cursor and a soft highlight tracks under it — the premium "holo
  // slab" feel. Springs keep it fluid; everything resets to centre on leave.
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [7, -7]), TILT_SPRING);
  const rotateY = useSpring(useTransform(mx, [0, 1], [-7, 7]), TILT_SPRING);
  const glareX = useTransform(mx, [0, 1], ['0%', '100%']);
  const glareY = useTransform(my, [0, 1], ['0%', '100%']);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX} ${glareY}, rgba(130,215,255,0.30), transparent 52%)`;

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  }, [mx, my]);
  const onEnter = useCallback(() => setHovered(true), []);
  const onLeave = useCallback(() => { setHovered(false); mx.set(0.5); my.set(0.5); }, [mx, my]);

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
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`Play ${game.title}`}
      data-cursor="PLAY"
      onMouseEnter={onEnter}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={() => setHovered(false)}
      onKeyDown={handleKeyDown}
      onClick={handlePlay}
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.045, 0.5), ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.035 }}
      style={{
        rotateX, rotateY, transformPerspective: 900,
        display: 'flex', flexDirection: 'column',
        borderRadius: 'var(--radius-md)', overflow: 'hidden', cursor: 'pointer',
        background: 'linear-gradient(157deg, rgba(20,26,42,0.55), rgba(9,11,20,0.7))',
        border: `1px solid ${hovered ? 'rgba(79,195,247,0.45)' : 'var(--color-line)'}`,
        boxShadow: hovered
          ? 'inset 0 1px 0 var(--color-line-bright), 0 22px 48px -18px rgba(0,0,0,0.8), 0 0 30px rgba(79,195,247,0.42), var(--shadow-glow)'
          : 'inset 0 1px 0 var(--color-line-bright), 0 8px 24px -12px rgba(0,0,0,0.6)',
        transition: 'box-shadow var(--dur) var(--ease-out-expo), border-color var(--dur) var(--ease-out-expo)',
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
              transform: hovered ? 'scale(1.08)' : 'scale(1)',
              transition: 'transform var(--dur-slow) var(--ease-out-expo)',
            }}
          />
        )}

        {/* Legibility gradient */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(5,6,10,0.85) 0%, transparent 55%)', pointerEvents: 'none' }} />

        {/* Cursor-tracked glare */}
        <motion.div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, zIndex: 12, pointerEvents: 'none',
            background: glare, mixBlendMode: 'screen',
            opacity: hovered ? 1 : 0, transition: 'opacity 0.3s var(--ease-out-expo)',
          }}
        />

        {/* Hover light sweep */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: '55%', zIndex: 11, pointerEvents: 'none',
            background: 'linear-gradient(105deg, transparent, rgba(180,235,255,0.40), transparent)',
            filter: 'blur(6px)', mixBlendMode: 'screen',
            transform: hovered ? 'translateX(230%) skewX(-12deg)' : 'translateX(-130%) skewX(-12deg)',
            transition: 'transform 0.7s var(--ease-out-expo)',
          }}
        />

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
    </motion.div>
  );
}

export const GameCard = React.memo(GameCardComponent);

// ─── FeaturedCard — cinematic hero spotlight at the top of the catalogue ─────────

interface FeaturedCardProps {
  readonly game: Game;
  readonly onPlayGame: (game: Game) => void;
  /** Optional purpose-designed wide hero art; falls back to the game's own cover. */
  readonly heroImage?: string;
}

function FeaturedCardComponent({ game, onPlayGame, heroImage }: FeaturedCardProps) {
  const [hovered, setHovered] = useState(false);
  // Prefer the designed hero art; step down to the game cover, then a fallback.
  const [src, setSrc] = useState<string | undefined>(heroImage ?? game.image);
  const onImgError = useCallback(() => {
    setSrc((prev) => (prev === heroImage && game.image && game.image !== heroImage ? game.image : undefined));
  }, [heroImage, game.image]);

  const handlePlay = useCallback(() => {
    if (!isSafeUrl(game.link)) {
      console.warn(`FeaturedCard: unsafe link blocked for "${game.title}"`);
      return;
    }
    soundEngine.transmission();
    window.dispatchEvent(new CustomEvent('play-game', { detail: { title: game.title, link: game.link } }));
    onPlayGame(game);
  }, [game, onPlayGame]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePlay(); }
  }, [handlePlay]);

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`Play ${game.title}`}
      data-cursor="PLAY"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onClick={handlePlay}
      onKeyDown={handleKeyDown}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'relative', aspectRatio: '16 / 8', overflow: 'hidden', cursor: 'pointer',
        borderRadius: 'var(--radius-lg, 18px)', marginBottom: 18,
        border: `1px solid ${hovered ? 'rgba(79,195,247,0.5)' : 'var(--color-line)'}`,
        boxShadow: hovered
          ? '0 26px 60px -22px rgba(0,0,0,0.85), 0 0 34px rgba(79,195,247,0.4)'
          : '0 14px 40px -18px rgba(0,0,0,0.7)',
        transition: 'box-shadow var(--dur) var(--ease-out-expo), border-color var(--dur) var(--ease-out-expo)',
      }}
    >
      {!src ? (
        <FallbackCover title={game.title} />
      ) : (
        <img
          src={src} alt="" loading="lazy" onError={onImgError} draggable={false}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 30%',
            transform: hovered ? 'scale(1.05)' : 'scale(1)',
            transition: 'transform var(--dur-slow) var(--ease-out-expo)',
          }}
        />
      )}

      {/* Scrims — strong on the left for text legibility */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(90deg, rgba(5,6,10,0.94) 0%, rgba(5,6,10,0.6) 40%, rgba(5,6,10,0.05) 76%)' }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(to top, rgba(5,6,10,0.75), transparent 55%)' }} />

      {/* Hover sweep */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: '45%', pointerEvents: 'none', zIndex: 2,
        background: 'linear-gradient(105deg, transparent, rgba(180,235,255,0.32), transparent)',
        filter: 'blur(8px)', mixBlendMode: 'screen',
        transform: hovered ? 'translateX(260%) skewX(-12deg)' : 'translateX(-140%) skewX(-12deg)',
        transition: 'transform 0.8s var(--ease-out-expo)',
      }} />

      {game.isHot && <CornerTag side="right" gold>Hot</CornerTag>}

      {/* Content */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, padding: 'clamp(18px, 3.2vw, 34px)', maxWidth: '76%' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-holo-300)' }}>
          {game.category === 'slot' ? 'Gladiator Original' : 'MetaWin Original'} · Featured
        </span>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-ice-50)', fontSize: 'clamp(22px, 3.4vw, 38px)', lineHeight: 1.05, margin: 0, textShadow: '0 2px 24px rgba(0,0,0,0.6)' }}>
          {game.title}
        </h3>
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-text-soft)', fontSize: 13, lineHeight: 1.55, margin: 0, maxWidth: '46ch', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {game.description}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 2 }}>
          {game.volatility && <VolatilityBar volatility={game.volatility} />}
          {game.rtp != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--color-gold)' }}>RTP {game.rtp}%</span>}
          {game.genre && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-mute)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--color-line)' }}>{game.genre}</span>}
        </div>
        <span className="btn btn--primary" aria-hidden="true" style={{ alignSelf: 'flex-start', marginTop: 6 }}>Play Demo</span>
      </div>
    </motion.div>
  );
}

export const FeaturedCard = React.memo(FeaturedCardComponent);
