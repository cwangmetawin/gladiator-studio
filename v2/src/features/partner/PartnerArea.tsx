import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ArrowUpRight, Check, ShieldCheck } from 'lucide-react';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
import { lines, safeHref } from '@/shared/utils/text';
import { Button, Reveal, CountUp } from '@/shared/ui';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { PartnerEarth } from './PartnerEarth';
import { LiveTicker } from '@/features/live-feed/LiveTicker';
import partnerDefault from '@/api/partnerDefault.json';
import './partner.css';

interface ValueProp { readonly tag: string; readonly title: string; readonly body: string }
interface Step { readonly step: string; readonly body: string }
interface PartnerContent {
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly ctaLabel: string;
  readonly ctaUrl: string;
  readonly contactEmail: string;
  readonly valueProps: readonly ValueProp[];
  readonly steps: readonly Step[];
  readonly specs: string | readonly string[];
  readonly catalogue: readonly { readonly title: string; readonly genre: string; readonly rtp: string }[];
  readonly complianceTitle: string;
  readonly complianceBody: string;
  readonly compliancePoints: string | readonly string[];
  readonly faqs: readonly { readonly q: string; readonly a: string }[];
  readonly closingTitle: string;
  readonly closingBody: string;
}

interface PartnerAreaProps {
  readonly onClose: () => void;
  readonly events: ComponentProps<typeof LiveTicker>['events'];
  readonly isConnected: boolean;
  readonly totalEvents: number;
  readonly totalAmount: number;
}

const EMBLEM_FILTER = 'brightness(0) invert(1) drop-shadow(0 0 24px rgba(79,195,247,0.5)) drop-shadow(0 0 56px rgba(79,195,247,0.22))';

/** Client Area — the homepage command console rotated into low orbit. Reuses the
 *  site's own shell (telemetry bar, ticker, scanlines), components (Button, Reveal,
 *  CountUp, glass .card) and motifs (emblem, count-up stats, cursor parallax) over
 *  a live, sun-lit Earth. Copy is DB-editable (admin 'partner'). */
export function PartnerArea({ onClose, events, isConnected, totalEvents, totalAmount }: PartnerAreaProps) {
  const c = useSection('partner', partnerDefault as PartnerContent);
  const s = useStudioStats();
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);

  const valueProps = (c.valueProps ?? []).filter((v) => v && (v.title || v.body || v.tag));
  const steps = (c.steps ?? []).filter((st) => st && (st.step || st.body));
  const specs = lines(c.specs);
  const catalogue = (c.catalogue ?? []).filter((g) => g && g.title);
  const compliancePoints = lines(c.compliancePoints);
  const faqs = (c.faqs ?? []).filter((f) => f && (f.q || f.a));
  const email = String(c.contactEmail || '').trim();
  const wagered = totalAmount >= 1000 ? `$${(totalAmount / 1000).toFixed(1)}K` : `$${totalAmount.toFixed(0)}`;

  // Flash the live telemetry on each socket update — the homepage's value-glow.
  const [evFlash, setEvFlash] = useState(false);
  const [waFlash, setWaFlash] = useState(false);
  const prevEv = useRef(totalEvents);
  const prevWa = useRef(totalAmount);
  useEffect(() => {
    if (prevEv.current === totalEvents) return;
    prevEv.current = totalEvents; setEvFlash(true);
    const t = setTimeout(() => setEvFlash(false), 600); return () => clearTimeout(t);
  }, [totalEvents]);
  useEffect(() => {
    if (prevWa.current === totalAmount) return;
    prevWa.current = totalAmount; setWaFlash(true);
    const t = setTimeout(() => setWaFlash(false), 600); return () => clearTimeout(t);
  }, [totalAmount]);

  // Cursor parallax → --mx/--my on the root, depth-graded in CSS (homepage recipe).
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = rootRef.current;
    if (isMobile || reduced || !el) return;
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e: MouseEvent) => { tx = (e.clientX / window.innerWidth) * 2 - 1; ty = (e.clientY / window.innerHeight) * 2 - 1; };
    const loop = () => {
      cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
      el.style.setProperty('--mx', cx.toFixed(4));
      el.style.setProperty('--my', cy.toFixed(4));
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); };
  }, [isMobile]);

  return (
    <motion.div ref={rootRef} className="partner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
      <div className="partner__stars" aria-hidden="true" />
      <PartnerEarth />
      <div className="fx-holo" aria-hidden="true" />
      <div className="partner__vignette" aria-hidden="true" />
      <span className="partner__bracket partner__bracket--tl" aria-hidden="true" />
      <span className="partner__bracket partner__bracket--tr" aria-hidden="true" />
      <span className="partner__bracket partner__bracket--bl" aria-hidden="true" />
      <span className="partner__bracket partner__bracket--br" aria-hidden="true" />

      {/* Shell top bar — the homepage StatusBar craft, "Partner Uplink" */}
      <header className="shell-bar partner__topbar">
        <span className="sys-label">
          <span className="sys-label__diamond" aria-hidden="true" />
          Gladiator<span style={{ color: 'var(--color-text-dim)' }} aria-hidden="true">·</span>Studio
        </span>
        <div className="partner__telemetry">
          <span className="readout">
            <span aria-hidden="true" className={isConnected ? 'animate-live-pulse' : undefined}
              style={{ width: 7, height: 7, borderRadius: '50%', background: isConnected ? 'var(--color-live)' : 'var(--color-ember)', boxShadow: `0 0 8px ${isConnected ? 'var(--color-live)' : 'var(--color-ember)'}` }} />
            {isConnected ? 'Live' : 'Offline'}
          </span>
          <span className="hairline--v" />
          <span className="readout">Events <span className="readout__value" style={{ animation: evFlash ? 'value-glow 0.6s ease-out' : undefined }}>{totalEvents.toLocaleString()}</span></span>
          <span className="hairline--v" />
          <span className="readout">Wagered <span className="readout__value readout__value--gold" style={{ animation: waFlash ? 'value-glow 0.6s ease-out' : undefined }}>{wagered}</span></span>
        </div>
        <div className="partner__topbar-right">
          <span className="readout partner__uplink-label">Partner Uplink</span>
          <button type="button" className="partner__disengage" onClick={onClose}>
            Disengage <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="partner__scroll">
        <main className="partner__stage">
          {/* Hero — centered establishing shot over the Earth limb */}
          <section className="partner__hero">
            <div className="partner__aura" aria-hidden="true" />
            <Reveal>
              <img src="/gladiator-logo.svg" alt="" aria-hidden="true" className="partner__emblem" width={935} height={535} style={{ filter: EMBLEM_FILTER }} />
            </Reveal>
            <Reveal delay={0.06}>
              {c.eyebrow && <span className="partner__eyebrow"><span className="partner__dot" aria-hidden="true" />{c.eyebrow}</span>}
              <h1 className="partner__title">{c.title}</h1>
              {c.lede && <p className="partner__lede">{c.lede}</p>}
            </Reveal>
            <Reveal delay={0.14}>
              <div className="partner__stats">
                <div className="stat"><CountUp className="stat__value stat__value--accent" to={s.games} decimals={0} /><span className="stat__label">Games</span></div>
                <span className="hairline--v partner__stat-rule" />
                <div className="stat"><CountUp className="stat__value" to={s.rtp} decimals={1} suffix="%" /><span className="stat__label">Max RTP</span></div>
                <span className="hairline--v partner__stat-rule" />
                <div className="stat"><CountUp className="stat__value" to={s.markets} decimals={0} /><span className="stat__label">Markets</span></div>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="partner__cta-row">
                {c.ctaLabel && <Button variant="primary" href={safeHref(c.ctaUrl)}>{c.ctaLabel}<ArrowUpRight size={15} aria-hidden="true" /></Button>}
                {email && <Button variant="secondary" href={`mailto:${email}`}>Talk to us</Button>}
              </div>
            </Reveal>
            <span className="partner__scroll-cue" aria-hidden="true"><ChevronRight size={16} style={{ transform: 'rotate(90deg)' }} /></span>
          </section>

          {/* Value props — shared glass cards */}
          {valueProps.length > 0 && (
            <section className="partner__row">
              {valueProps.map((v, i) => (
                <Reveal key={i} delay={i * 0.08}>
                  <div className="card card--hover partner__card">
                    {v.tag && <span className="card__label">{v.tag}</span>}
                    {v.title && <h3 className="card__title">{v.title}</h3>}
                    {v.body && <p className="body-text">{v.body}</p>}
                    <span className="partner__corner" aria-hidden="true" />
                  </div>
                </Reveal>
              ))}
            </section>
          )}

          {/* Integration protocol — constellation on a holo spine */}
          {steps.length > 0 && (
            <section className="partner__block">
              <Reveal><h2 className="partner__h2"><span className="partner__tick" aria-hidden="true" />Integration protocol</h2></Reveal>
              <ol className="partner__protocol">
                <span className="partner__spine" aria-hidden="true" />
                {steps.map((st, i) => (
                  <Reveal key={i} delay={i * 0.07}>
                    <li className="partner__proto-row">
                      <span className="partner__step-id"><span className="partner__node" aria-hidden="true" />STEP_{String(i + 1).padStart(2, '0')}</span>
                      <div className="partner__proto-body">
                        {st.step && <h4>{st.step}</h4>}
                        {st.body && <p>{st.body}</p>}
                      </div>
                    </li>
                  </Reveal>
                ))}
              </ol>
            </section>
          )}

          {/* What you get */}
          {specs.length > 0 && (
            <section className="partner__block">
              <Reveal><h2 className="partner__h2"><span className="partner__tick" aria-hidden="true" />What you get</h2></Reveal>
              <ul className="partner__readout">
                {specs.map((sp, i) => <Reveal key={`${sp}-${i}`} delay={i * 0.04}><li><Check size={13} aria-hidden="true" />{sp}</li></Reveal>)}
              </ul>
            </section>
          )}

          {/* Featured catalogue */}
          {catalogue.length > 0 && (
            <section className="partner__block">
              <Reveal><h2 className="partner__h2"><span className="partner__tick" aria-hidden="true" />Featured titles</h2></Reveal>
              <div className="partner__titles">
                {catalogue.map((g, i) => (
                  <Reveal key={i} delay={i * 0.05}>
                    <div className="partner__title-card">
                      <span className="partner__title-name">{g.title}</span>
                      {g.genre && <span className="partner__title-genre">{g.genre}</span>}
                      {g.rtp && <span className="partner__title-rtp">{g.rtp}</span>}
                    </div>
                  </Reveal>
                ))}
              </div>
            </section>
          )}

          {/* Compliance & certification */}
          {(c.complianceTitle || compliancePoints.length > 0) && (
            <section className="partner__block">
              <Reveal>
                <div className="partner__compliance">
                  <div className="partner__compliance-head">
                    <span className="partner__tag">Compliance</span>
                    {c.complianceTitle && <h3>{c.complianceTitle}</h3>}
                    {c.complianceBody && <p>{c.complianceBody}</p>}
                  </div>
                  {compliancePoints.length > 0 && (
                    <ul className="partner__compliance-list">
                      {compliancePoints.map((p, i) => <li key={`${p}-${i}`}><ShieldCheck size={15} aria-hidden="true" />{p}</li>)}
                    </ul>
                  )}
                </div>
              </Reveal>
            </section>
          )}

          {/* FAQ */}
          {faqs.length > 0 && (
            <section className="partner__block">
              <Reveal><h2 className="partner__h2"><span className="partner__tick" aria-hidden="true" />Partner FAQ</h2></Reveal>
              <div className="partner__faq">
                {faqs.map((f, i) => (
                  <Reveal key={i} delay={i * 0.05}>
                    <div className="partner__faq-item">
                      {f.q && <h4>{f.q}</h4>}
                      {f.a && <p>{f.a}</p>}
                    </div>
                  </Reveal>
                ))}
              </div>
            </section>
          )}

          {/* Closing */}
          <Reveal>
            <section className="partner__closing">
              {c.closingTitle && <h2>{c.closingTitle}</h2>}
              {c.closingBody && <p>{c.closingBody}</p>}
              {c.ctaLabel && <Button variant="primary" href={safeHref(c.ctaUrl)}>{c.ctaLabel}<ArrowUpRight size={16} aria-hidden="true" /></Button>}
              {email && <p className="partner__contact">or transmit to <a href={`mailto:${email}`}>{email}</a></p>}
            </section>
          </Reveal>

          <footer className="partner__foot">© 2026 Gladiator Studio · A MetaWin Company</footer>
        </main>
      </div>

      <LiveTicker events={events} isConnected={isConnected} />
    </motion.div>
  );
}
