import { Github, Linkedin, Mail } from 'lucide-react';
import { SectionWrapper } from '@/shared/components/SectionWrapper';
import { SectionHeading, Stat, Button, Divider } from '@/shared/ui';

const LEAD = {
  initials: 'CW',
  name: 'CHAO WANG',
  role: 'CTO & Head of Game Development',
  callsign: 'THE ARCHITECT',
  location: 'London, UK',
  company: 'MetaWin Group',
  experience: '10+ yrs',
  bio: 'Industry pioneer — the first person to systematically deploy AI, large language models, and autonomous agent systems at production scale in iGaming. Chao architected the entire Gladiator Studio technology stack from the ground up and leads all engineering, AI R&D, and product development within the MetaWin group.',
  bio2: 'His AI-first approach has fundamentally reshaped how games are designed, tested, and optimized: LLM-powered game content generation, multi-agent orchestration for automated QA pipelines, real-time adaptive game balancing via reinforcement learning, and Claude-driven autonomous development workflows that compress months of engineering into days.',
  bio3: 'Before MetaWin, Chao spent a decade at the bleeding edge of gaming technology — building platforms processing $100M+ in daily wagers, contributing core modules to Pixi.js (the most widely used 2D WebGL renderer), and creating Chao2D, a purpose-built rendering engine for high-performance H5 gaming.',
  expertise: ['AI / LLM Pioneer in iGaming', 'Multi-Agent Systems', 'Game Architecture', 'WebGL / Pixi.js', 'Distributed Systems', 'Cloud (AWS + GCP)', 'Crypto-Native', 'Tech Leadership'],
  missions: [
    'First to deploy LLMs and autonomous AI agents in production iGaming — industry pioneer',
    'Architected multi-agent AI pipeline: game design → math validation → QA → deployment',
    'Built Claude-powered autonomous dev workflows — 10x engineering velocity',
    'Architected gaming aggregation platform — $100M+ daily wagers',
    'Core open-source contributor to Pixi.js (world\'s #1 2D WebGL renderer)',
    'Created Chao2D rendering engine for H5 gaming',
    'Built Newtonian physics engine for browser games',
    'Shipped 34 live titles (8 Gladiator ULTRA-volatility slots + 26 MetaWin Originals)',
    'Dual-cloud AWS + GCP elite-tier infrastructure across 7 markets',
    'Built and scaled cross-functional teams across engineering, AI, art, QA',
  ],
  social: {
    linkedin: 'https://www.linkedin.com/in/chaow/',
    email: 'cwang@metawin.inc',
    github: 'https://github.com/gladiator-studio',
  },
} as const;

const TEAM_STATS: readonly { readonly value: string; readonly label: string }[] = [
  { value: '10+', label: 'Years Exp' },
  { value: '34', label: 'Games Shipped' },
  { value: '8', label: 'Live Slots' },
  { value: '7', label: 'Markets' },
];

const CULTURE_VALUES: readonly { readonly tag: string; readonly text: string }[] = [
  { tag: 'Craft', text: 'Small senior team. Every engineer ships to production. No bureaucracy.' },
  { tag: 'Velocity', text: 'Concept to live deployment in weeks, not quarters. Ship fast, iterate faster.' },
  { tag: 'Ownership', text: 'Full-stack ownership from game mathematics to cloud infrastructure.' },
  { tag: 'Impact', text: 'Our games are played by hundreds of thousands of real players daily.' },
];

function openCareers() {
  window.dispatchEvent(new CustomEvent('open-panel', { detail: 'careers' }));
}

function SocialBtn({ href, label, icon }: { readonly href: string; readonly label: string; readonly icon: React.ReactNode }) {
  const resolved = !href.startsWith('http') && href.includes('@') ? `mailto:${href}` : href;
  return (
    <a className="icon-btn" href={resolved} aria-label={label} target="_blank" rel="noopener noreferrer">
      {icon}
    </a>
  );
}

function LeadershipCard() {
  return (
    <div className="card" role="article" aria-label={`Leadership: ${LEAD.name}`}>
      <span className="card__label">Leadership</span>

      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div aria-hidden="true" style={{ position: 'relative', width: 56, height: 62, flexShrink: 0 }}>
          <div style={{
            width: 56, height: 62,
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
            background: 'var(--color-holo-500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 52, height: 58,
              clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
              background: 'var(--color-void-800)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700, color: 'var(--color-holo-300)', letterSpacing: 2 }}>
                {LEAD.initials}
              </span>
            </div>
          </div>
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 14, height: 14, borderRadius: '50%',
            background: 'var(--color-live)', border: '2px solid var(--color-void-800)',
            boxShadow: '0 0 8px var(--color-live)',
          }} />
        </div>
        <div>
          <div className="card__title" style={{ marginBottom: 2 }}>{LEAD.name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-holo-300)' }}>
            {LEAD.role}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--color-gold)', marginTop: 4, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            {LEAD.callsign}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--color-text-mute)', marginTop: 4, letterSpacing: '0.08em' }}>
            {LEAD.location} · {LEAD.experience} · {LEAD.company}
          </div>
        </div>
      </div>

      {/* Bio */}
      <p className="body-text" style={{ marginBottom: 12 }}>{LEAD.bio}</p>
      <p className="body-text" style={{ marginBottom: 12 }}>{LEAD.bio2}</p>
      <p className="body-text">{LEAD.bio3}</p>

      <Divider className="my-4" />

      {/* Expertise */}
      <span className="card__label">Expertise</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {LEAD.expertise.map((tag) => (
          <span key={tag} className="chip" translate="no">{tag}</span>
        ))}
      </div>

      <Divider className="my-4" />

      {/* Highlights */}
      <span className="card__label">Highlights</span>
      <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {LEAD.missions.map((m) => (
          <li key={m} style={{ display: 'flex', gap: 10 }}>
            <span aria-hidden="true" style={{ color: 'var(--color-holo-300)', fontFamily: 'var(--font-mono)', flexShrink: 0, lineHeight: 1.65 }}>—</span>
            <span className="body-text">{m}</span>
          </li>
        ))}
      </ul>

      <Divider className="my-4" />

      {/* Social */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="readout">Contact</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <SocialBtn href={LEAD.social.linkedin} label="LinkedIn profile" icon={<Linkedin size={16} />} />
          <SocialBtn href={LEAD.social.email} label="Send email" icon={<Mail size={16} />} />
          <SocialBtn href={LEAD.social.github} label="GitHub organisation" icon={<Github size={16} />} />
        </div>
      </div>
    </div>
  );
}

function TeamStatsCard() {
  return (
    <div className="card">
      <span className="card__label">By the Numbers</span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 12 }}>
        {TEAM_STATS.map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 4vw, 28px)' }}>
            {i > 0 && <Divider vertical />}
            <Stat value={s.value} label={s.label} accent={i === 0} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CultureCard() {
  return (
    <div className="card">
      <span className="card__label">How We Work</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {CULTURE_VALUES.map((v) => (
          <div key={v.tag}>
            <h3 className="card__title" style={{ fontSize: '0.95rem', marginBottom: 4 }}>{v.tag}</h3>
            <p className="body-text">{v.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function JoinTeamCard() {
  return (
    <div className="card">
      <span className="card__label">Join the Team</span>
      <p className="body-text" style={{ marginBottom: 16 }}>
        We hire senior talent across engineering, design, and product on a rolling basis.
        If you are exceptional at what you do and want to build games that real players use daily, we want to hear from you.
      </p>
      <Button variant="primary" onClick={openCareers}>Join the Team</Button>
    </div>
  );
}

export function TeamSection() {
  return (
    <SectionWrapper id="team">
      <SectionHeading
        as="h1"
        eyebrow="Team"
        title="Built by people who understand the game"
        lede="Deep expertise in game mathematics, WebGL rendering, distributed systems, and crypto-native product design — a small senior team shipping titles played by hundreds of thousands daily."
      />
      <LeadershipCard />
      <TeamStatsCard />
      <CultureCard />
      <JoinTeamCard />
    </SectionWrapper>
  );
}
