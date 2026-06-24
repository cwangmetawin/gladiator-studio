import { SectionWrapper } from '@/shared/components/SectionWrapper';
import { SectionHeading, Button, Divider, Reveal, CountUp } from '@/shared/ui';

const FEATURE_CARDS: readonly { readonly tag: string; readonly title: string; readonly body: string }[] = [
  {
    tag: 'Volatility',
    title: 'ULTRA volatility, by design',
    body: 'Every Gladiator game is built to ULTRA volatility specification. Our maths team calibrates each title for peak win ceilings that create the social moments high-value players seek — and that operators use to drive acquisition.',
  },
  {
    tag: 'Integrity',
    title: 'Provably fair mathematics',
    body: 'All Gladiator titles use certified RNG with full audit trails. RTPs are published, testable, and consistent across every integration. Compliance documentation ready on request for licensed jurisdictions.',
  },
  {
    tag: 'Infrastructure',
    title: 'Powered by MetaWin infrastructure',
    body: 'Games run on the same AWS and GCP infrastructure that handles MetaWin global casino traffic. Sub-100ms round-trip times, 99.99% uptime SLA, and real-time bet data via our feeder system across every integrated market.',
  },
  {
    tag: 'Integration',
    title: 'One integration, full catalogue',
    body: 'A single API connection gives operators access to all 8 Gladiator slots and 26 MetaWin Originals. JSON-based integration docs, a sandbox environment, and a dedicated technical account manager with every partner onboarding.',
  },
] as const;

const TECH = ['WebGL', 'TypeScript', 'Pixi.js', 'Babylon.js', 'Node.js', 'AWS', 'GCP', 'BigQuery'] as const;

const METRICS: readonly { readonly to: number; readonly decimals: number; readonly suffix: string; readonly label: string; readonly accent?: boolean }[] = [
  { to: 34, decimals: 0, suffix: '', label: 'Games', accent: true },
  { to: 97.5, decimals: 1, suffix: '%', label: 'Max RTP' },
  { to: 7, decimals: 0, suffix: '', label: 'Markets' },
];

function openContact() {
  window.dispatchEvent(new CustomEvent('open-panel', { detail: 'contact' }));
}

export function AboutSection() {
  return (
    <SectionWrapper id="about">
      <SectionHeading
        as="h1"
        eyebrow="About"
        title="The studio that powers MetaWin"
        lede="In-house game development for the world’s leading crypto casino — high-volatility mechanics, provably fair maths, and cinematic production from a single pipeline."
      />

      {/* Dossier */}
      <Reveal delay={0}>
        <div className="card">
          <span className="card__label">Dossier</span>
          <p className="body-text" style={{ marginBottom: 12 }}>
            Gladiator Studio is the in-house game development division of{' '}
            <a href="https://metawin.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-holo-300)', textDecoration: 'underline', textUnderlineOffset: 2 }}>MetaWin</a>,
            the world’s leading crypto casino. Founded in London, we design and build slot games from the ground up — combining high-volatility mechanics, provably fair mathematics, and cinematic production quality for a player base that expects nothing less.
          </p>
          <p className="body-text" style={{ marginBottom: 12 }}>
            Every title in our catalogue carries ULTRA volatility and RTPs above 96%, engineered for the crypto-native player who plays for life-changing hits. Our stack is built on WebGL, Babylon.js 3D, and TypeScript — running on AWS and GCP infrastructure capable of serving millions of concurrent sessions. We own the full production pipeline: game design, mathematics, front-end rendering, back-end integration, and live ops.
          </p>
          <p className="body-text">
            For operators and aggregators, integrating Gladiator Studio means accessing a battle-tested library of 34 titles backed by MetaWin platform infrastructure: seamless API integration, real-time bet data via our feeder system, and dedicated account support.
          </p>
        </div>
      </Reveal>

      {/* Key metrics — count up on reveal */}
      <Reveal delay={0.08}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 12 }}>
          {METRICS.map((m, i) => (
            <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 4vw, 28px)' }}>
              {i > 0 && <Divider vertical />}
              <div className="stat">
                <CountUp className={m.accent ? 'stat__value stat__value--accent' : 'stat__value'} to={m.to} decimals={m.decimals} suffix={m.suffix} />
                <span className="stat__label">{m.label}</span>
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Feature cards */}
      {FEATURE_CARDS.map((card, i) => (
        <Reveal key={card.tag} delay={0.12 + i * 0.05}>
          <div className="card card--hover">
            <span className="card__label">{card.tag}</span>
            <h3 className="card__title">{card.title}</h3>
            <p className="body-text">{card.body}</p>
          </div>
        </Reveal>
      ))}

      {/* Tech stack */}
      <Reveal delay={0.1}>
        <div className="card">
          <span className="card__label">Tech Stack</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TECH.map((t) => <span key={t} className="chip" translate="no">{t}</span>)}
          </div>
        </div>
      </Reveal>

      {/* CTAs */}
      <Reveal delay={0.14}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Button variant="primary" href="https://metawin.com" target="_blank" rel="noopener noreferrer">Visit MetaWin</Button>
          <Button variant="secondary" href="mailto:cwang@metawin.inc?subject=Demo Request — Gladiator Studio">Request Demo</Button>
          <Button variant="secondary" onClick={openContact}>Partner With Us</Button>
        </div>
      </Reveal>
    </SectionWrapper>
  );
}
