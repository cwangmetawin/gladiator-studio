'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { Gamepad2, Info, Users, Map as MapIcon, Radio, Briefcase, Mail } from 'lucide-react';
import { Eyebrow, Button, Divider } from '@/shared/ui';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { soundEngine } from '@/shared/utils/soundEngine';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
import './hero.css';

const EXPO = [0.16, 1, 0.3, 1] as const;

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

// ─── Central identity hub ─────────────────────────────────────────────────────

function IdentityHub({ compact }: { readonly compact?: boolean }) {
  const hero = useSection('hero', { tagline: 'A MetaWin Studio' });
  // Games = auto-counted from the catalogue; RTP/Markets = shared Studio Stats.
  const s = useStudioStats();
  const stats = [
    { end: s.games, decimals: 0, suffix: '', label: 'Games', accent: true },
    { end: s.rtp, decimals: 1, suffix: '%', label: 'Max RTP', accent: false },
    { end: s.markets, decimals: 0, suffix: '', label: 'Markets', accent: false },
  ];
  return (
    <>
      <Eyebrow dot>
        {String(hero.tagline)}
        <span aria-hidden="true" style={{ color: 'var(--color-text-dim)' }}>—</span>
        <a href="https://metawin.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-holo-300)', textDecorationLine: 'underline', textUnderlineOffset: 3 }}>metawin.com</a>
      </Eyebrow>

      <h1 style={{ margin: 0, lineHeight: 0 }}>
        <span className="sr-only">Gladiator Studio</span>
        <img src="/gladiator-logo.svg" alt="" aria-hidden="true" className="hero-logo" width={935} height={535}
          style={{ width: compact ? 'clamp(220px,74vw,300px)' : 'clamp(300px,32vw,470px)', height: 'auto',
            filter: 'brightness(0) invert(1) drop-shadow(0 0 24px rgba(79,195,247,0.5)) drop-shadow(0 0 56px rgba(79,195,247,0.22))' }} />
      </h1>

      <div aria-label={stats.map((st) => `${st.end}${st.suffix} ${st.label}`).join(', ')} style={{ display: 'flex', alignItems: 'center', gap: compact ? 16 : 26 }}>
        {stats.map((s, i) => (
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
  const [ripple, setRipple] = useState<{ key: number; panel: PanelId } | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const rippleSeq = useRef(0);

  // ── Cursor parallax ──────────────────────────────────────────────────────────
  // One rAF loop smooths the normalized cursor into CSS vars (--mx/--my) on the
  // stage; each layer consumes them at a different depth via transform (GPU only,
  // no reflow). Disabled for reduced-motion + touch. (Per the hub-interactivity spec.)
  useEffect(() => {
    if (isMobile || typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = stageRef.current;
    if (!el) return;
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e: MouseEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const loop = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      el.style.setProperty('--mx', cx.toFixed(4));
      el.style.setProperty('--my', cy.toFixed(4));
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); };
  }, [isMobile]);

  // Click ripple — one pulse at a time, auto-cleared after the animation.
  const fireRipple = (panel: PanelId) => {
    const key = ++rippleSeq.current;
    setRipple({ key, panel });
    window.setTimeout(() => setRipple((r) => (r && r.key === key ? null : r)), 600);
  };

  // Magnetic pull — the hovered node's ring eases toward the cursor.
  const onNodeMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    e.currentTarget.style.setProperty('--pull-x', `${(dx * 0.25).toFixed(1)}px`);
    e.currentTarget.style.setProperty('--pull-y', `${(dy * 0.25).toFixed(1)}px`);
  };
  const onNodeLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.setProperty('--pull-x', '0px');
    e.currentTarget.style.setProperty('--pull-y', '0px');
    setHovered(null);
  };

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
    <section id="home" ref={stageRef} className="hero-stage" aria-label="Gladiator Studio — navigation"
      style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}>
      <div className="tech-grid" aria-hidden="true" />
      <div className="hero-aura" aria-hidden="true" />
      <div className="hero-flare" aria-hidden="true" style={{ top: '6%', right: '12%' }} />
      <HudTicks />

      {/* Connector lines — faint static base + a pulse of energy flowing hub → node */}
      <svg className="holo-lines" aria-hidden="true">
        {NODES.map((n, i) => (
          <line key={n.panelId} x1={`${HUB_X}%`} y1={`${HUB_Y}%`} x2={`${n.x}%`} y2={`${n.y}%`}
            className={`holo-line${hovered === n.panelId ? ' is-active' : ''}`} style={{ animationDelay: `${0.3 + i * 0.07}s` }} />
        ))}
        {NODES.map((n, i) => (
          <line key={`flow-${n.panelId}`} x1={`${HUB_X}%`} y1={`${HUB_Y}%`} x2={`${n.x}%`} y2={`${n.y}%`}
            className={`holo-line-flow${hovered === n.panelId ? ' is-active' : ''}`} style={{ animationDelay: `${i * 0.45}s` }} />
        ))}
      </svg>

      {/* Section nodes — parallax (near) layer */}
      <nav aria-label="Sections" className="holo-nodes-layer">
        {NODES.map((n, i) => {
          const Icon = n.icon;
          return (
            <button key={n.panelId} type="button" className="holo-node" aria-label={`Open ${n.label}`} data-cursor="OPEN"
              style={{ left: `${n.x}%`, top: `${n.y}%`, animationDelay: `${0.5 + i * 0.08}s`,
                ['--dur' as string]: `${6 + (i % 4) * 0.9}s`, ['--delay' as string]: `${((i * 0.7) % 3).toFixed(2)}s` } as CSSProperties}
              onMouseEnter={() => { setHovered(n.panelId); soundEngine.hover(); }}
              onMouseMove={onNodeMove}
              onMouseLeave={onNodeLeave}
              onFocus={() => setHovered(n.panelId)} onBlur={() => setHovered(null)}
              onClick={() => { openPanel(n.panelId); fireRipple(n.panelId); }}>
              <span className="holo-node__float">
                <span className="holo-node__lock" aria-hidden="true" />
                <span className="holo-node__ring">
                  <Icon size={20} />
                  {ripple?.panel === n.panelId && <span key={ripple.key} className="holo-node__pulse" aria-hidden="true" />}
                </span>
                <span className="holo-node__label">{n.label}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Central identity hub — parallax + subtle tilt (mid layer) */}
      <div className="hub-layer" style={{ position: 'absolute', top: `${HUB_Y}%`, left: '50%', zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: 'min(92vw, 460px)' }}>
        <IdentityHub />
      </div>

    </section>
  );
}
