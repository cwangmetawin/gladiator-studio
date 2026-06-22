'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { Gamepad2, Info, Users, Map as MapIcon, Radio, Briefcase, Mail } from 'lucide-react';
import { Eyebrow, Button, Divider } from '@/shared/ui';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { soundEngine } from '@/shared/utils/soundEngine';
import './hero.css';

const EXPO = [0.16, 1, 0.3, 1] as const;
const SPRING = { stiffness: 55, damping: 24, mass: 0.6 } as const;

type PanelId = 'games' | 'about' | 'team' | 'journey' | 'live' | 'careers' | 'contact';

// Constellation nodes — position is % of the hero viewport. Hub sits at (50, 44).
const HUB_X = 50;
const HUB_Y = 44;
const NODES: readonly {
  label: string; panelId: PanelId; icon: React.ComponentType<{ size?: number }>;
  x: number; y: number; meta: string;
}[] = [
  { label: 'Games',   panelId: 'games',   icon: Gamepad2,  x: 27, y: 25, meta: '34 titles' },
  { label: 'About',   panelId: 'about',   icon: Info,      x: 73, y: 23, meta: 'The studio' },
  { label: 'Team',    panelId: 'team',    icon: Users,     x: 13, y: 49, meta: 'The crew' },
  { label: 'Journey', panelId: 'journey', icon: MapIcon,   x: 87, y: 47, meta: 'Timeline' },
  { label: 'Live',    panelId: 'live',    icon: Radio,     x: 26, y: 72, meta: 'Real-time' },
  { label: 'Careers', panelId: 'careers', icon: Briefcase, x: 74, y: 70, meta: 'Join us' },
  { label: 'Contact', panelId: 'contact', icon: Mail,      x: 50, y: 81, meta: 'Partner' },
] as const;

const STATS = [
  { end: 34, decimals: 0, suffix: '', label: 'Games', accent: true },
  { end: 97.5, decimals: 1, suffix: '%', label: 'Max RTP', accent: false },
  { end: 7, decimals: 0, suffix: '', label: 'Markets', accent: false },
] as const;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useCountUp(end: number, delay: number, duration = 1500): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setValue(end); return; }
    let raf = 0; let startTs = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const timer = setTimeout(() => {
      const step = (ts: number) => {
        if (!startTs) startTs = ts;
        const p = Math.min((ts - startTs) / duration, 1);
        setValue(end * ease(p));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [end, delay, duration]);
  return value;
}

function CountStat({ end, decimals, suffix, label, accent, delay }: {
  readonly end: number; readonly decimals: number; readonly suffix: string;
  readonly label: string; readonly accent: boolean; readonly delay: number;
}) {
  const v = useCountUp(end, delay);
  return (
    <div className="stat">
      <span className={accent ? 'stat__value stat__value--accent' : 'stat__value'}>{v.toFixed(decimals)}{suffix}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

function openPanel(id: PanelId) {
  soundEngine.click();
  window.dispatchEvent(new CustomEvent('open-panel', { detail: id }));
}

function HudTicks() {
  const b = '1px solid rgba(79,195,247,0.4)';
  return (
    <div aria-hidden="true">
      <span className="hud-tick" style={{ top: 70, left: 22, borderTop: b, borderLeft: b }} />
      <span className="hud-tick" style={{ top: 70, right: 22, borderTop: b, borderRight: b }} />
      <span className="hud-tick" style={{ bottom: 70, left: 22, borderBottom: b, borderLeft: b }} />
      <span className="hud-tick" style={{ bottom: 70, right: 22, borderBottom: b, borderRight: b }} />
    </div>
  );
}

const BOOT_LINES: readonly (readonly [string, string])[] = [
  ['> init orbital uplink … ', 'ok'],
  ['> sync 34 titles … ', 'ok'],
  ['> link 7 markets … ', 'ok'],
  ['> gladiator os … ', 'ready'],
];

function BootLog() {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(BOOT_LINES.length); return; }
    let i = 0;
    const id = setInterval(() => { i += 1; setShown(i); if (i >= BOOT_LINES.length) clearInterval(id); }, 560);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="boot-log" aria-hidden="true" style={{ position: 'absolute', left: 26, bottom: 66, zIndex: 4 }}>
      {BOOT_LINES.slice(0, shown).map((l, idx) => (
        <div key={idx} className="boot-log__line">{l[0]}<span className="ok">{l[1]}</span></div>
      ))}
    </div>
  );
}

// ─── Central identity hub ─────────────────────────────────────────────────────

function IdentityHub({ compact }: { readonly compact?: boolean }) {
  return (
    <>
      <Eyebrow dot>
        A MetaWin Studio
        <span aria-hidden="true" style={{ color: 'var(--color-text-dim)' }}>—</span>
        <a href="https://metawin.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-holo-300)', textDecorationLine: 'underline', textUnderlineOffset: 3 }}>metawin.com</a>
      </Eyebrow>

      <h1 style={{ margin: 0, lineHeight: 0 }}>
        <span className="sr-only">Gladiator Studio</span>
        <img src="/gladiator-logo.svg" alt="" aria-hidden="true" className="hero-logo" width={935} height={535}
          style={{ width: compact ? 'clamp(220px,74vw,300px)' : 'clamp(300px,32vw,470px)', height: 'auto',
            filter: 'brightness(0) invert(1) drop-shadow(0 0 24px rgba(79,195,247,0.5)) drop-shadow(0 0 56px rgba(79,195,247,0.22))' }} />
      </h1>

      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(0.6rem,1.1vw,0.76rem)', fontWeight: 500, letterSpacing: '0.34em', textTransform: 'uppercase', color: 'var(--color-text-mute)', margin: 0 }}>
        Premium iGaming Studio
      </p>

      <div aria-label="34 games, 97.5% max RTP, 7 markets" style={{ display: 'flex', alignItems: 'center', gap: compact ? 16 : 26 }}>
        {STATS.map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: compact ? 16 : 26 }}>
            {i > 0 && <Divider vertical />}
            <CountStat {...s} delay={700 + i * 160} />
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────────

export interface HeroProps {
  readonly panelSide?: 'left' | 'right';
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

export function Hero(_props: HeroProps) {
  const isMobile = useIsMobile();
  const [hovered, setHovered] = useState<PanelId | null>(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const sx = useSpring(rawX, SPRING);
  const sy = useSpring(rawY, SPRING);
  const hubX = useTransform(sx, [-0.5, 0.5], [-14, 14]);
  const hubY = useTransform(sy, [-0.5, 0.5], [-10, 10]);

  const onMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
    rawX.set(e.clientX / window.innerWidth - 0.5);
    rawY.set(e.clientY / window.innerHeight - 0.5);
  }, [rawX, rawY]);
  const onLeave = useCallback(() => { rawX.set(0); rawY.set(0); }, [rawX, rawY]);

  // ─── Mobile: centered hero + drawer nav ───────────────────────────────────────
  if (isMobile) {
    return (
      <section id="home" aria-label="Gladiator Studio"
        style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '64px 20px 96px' }}>
        <div className="hero-aura" aria-hidden="true" />
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EXPO }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, position: 'relative', zIndex: 5 }}>
          <IdentityHub compact />
          <div role="group" aria-label="Primary actions" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 4 }}>
            <Button variant="primary" onClick={() => openPanel('games')}>Explore Games</Button>
            <Button variant="secondary" onClick={() => openPanel('contact')}>Partner With Us</Button>
          </div>
        </motion.div>
      </section>
    );
  }

  // ─── Desktop: galaxy holotable ─────────────────────────────────────────────────
  return (
    <section id="home" onMouseMove={onMove} onMouseLeave={onLeave} aria-label="Gladiator Studio — navigation"
      style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}>
      <div className="tech-grid" aria-hidden="true" />
      <div className="hero-aura" aria-hidden="true" />
      <div className="hero-flare" aria-hidden="true" style={{ top: '6%', right: '12%' }} />
      <div className="hub-rings" aria-hidden="true" />
      <div className="hub-radar" aria-hidden="true" />
      <HudTicks />
      <BootLog />

      {/* Connector lines from hub to each node */}
      <svg className="holo-lines" aria-hidden="true">
        {NODES.map((n, i) => (
          <line key={n.panelId} x1={`${HUB_X}%`} y1={`${HUB_Y}%`} x2={`${n.x}%`} y2={`${n.y}%`}
            className={`holo-line${hovered === n.panelId ? ' is-active' : ''}`} style={{ animationDelay: `${0.3 + i * 0.07}s` }} />
        ))}
      </svg>

      {/* Section nodes */}
      <nav aria-label="Sections">
        {NODES.map((n, i) => {
          const Icon = n.icon;
          return (
            <button key={n.panelId} type="button" className="holo-node" aria-label={`Open ${n.label}`}
              style={{ left: `${n.x}%`, top: `${n.y}%`, animationDelay: `${0.5 + i * 0.08}s` }}
              onMouseEnter={() => { setHovered(n.panelId); soundEngine.hover(); }}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(n.panelId)} onBlur={() => setHovered(null)}
              onClick={() => openPanel(n.panelId)}>
              <span className="holo-node__lock" aria-hidden="true" />
              <span className="holo-node__ring"><Icon size={20} /></span>
              <span className="holo-node__label">{n.label}</span>
              <span className="holo-node__meta">{n.meta}</span>
            </button>
          );
        })}
      </nav>

      {/* Central identity hub */}
      <motion.div style={{ x: hubX, y: hubY, position: 'absolute', top: `${HUB_Y}%`, left: '50%', translateX: '-50%', translateY: '-50%', zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: 'min(92vw, 460px)' }}>
        <IdentityHub />
      </motion.div>

      <div className="hud-coords" aria-hidden="true" style={{ position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', zIndex: 4 }}>
        Gladiator Orbital Command · 51.5072°N 0.1276°W · ALT 408KM · Live
      </div>
    </section>
  );
}
