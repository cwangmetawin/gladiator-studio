import { SectionWrapper } from '@/shared/components/SectionWrapper';
import { SectionHeading, Button, Divider, Reveal, CountUp } from '@/shared/ui';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
import { lines } from '@/shared/utils/text';
import aboutDefault from '@/api/aboutDefault.json';

interface AboutContent {
  readonly tech: string;
  readonly features: readonly { readonly tag: string; readonly title: string; readonly body: string }[];
}

function openContact() {
  window.dispatchEvent(new CustomEvent('open-panel', { detail: 'contact' }));
}

export function AboutSection() {
  const about = useSection('about', aboutDefault as AboutContent);
  const s = useStudioStats();
  const metrics = [
    { to: s.games, decimals: 0, suffix: '', label: 'Games', accent: true },
    { to: s.rtp, decimals: 1, suffix: '%', label: 'Max RTP', accent: false },
    { to: s.markets, decimals: 0, suffix: '', label: 'Markets', accent: false },
  ];
  const features = (about.features ?? []).filter((c) => c && (c.title || c.body || c.tag));
  const tech = lines(about.tech);
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
          {metrics.map((m, i) => (
            <div key={`${m.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 4vw, 28px)' }}>
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
      {features.map((card, i) => (
        <Reveal key={`${card.tag}-${i}`} delay={0.12 + i * 0.05}>
          <div className="card card--hover">
            {card.tag && <span className="card__label">{card.tag}</span>}
            {card.title && <h3 className="card__title" style={{ overflowWrap: 'anywhere' }}>{card.title}</h3>}
            {card.body && <p className="body-text" style={{ overflowWrap: 'anywhere' }}>{card.body}</p>}
          </div>
        </Reveal>
      ))}

      {/* Tech stack */}
      <Reveal delay={0.1}>
        <div className="card">
          <span className="card__label">Tech Stack</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tech.map((t) => <span key={t} className="chip" translate="no">{t}</span>)}
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
