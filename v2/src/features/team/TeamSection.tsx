import { Github, Linkedin, Mail } from 'lucide-react';
import { SectionWrapper } from '@/shared/components/SectionWrapper';
import { SectionHeading, Button, Divider, Reveal, CountUp } from '@/shared/ui';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
import { lines, paras, safeHref } from '@/shared/utils/text';

interface Member { readonly name: string; readonly role: string; readonly image: string; readonly bio: string; }

/** Additional team members (editable in the admin). Hidden while empty — today
 *  it's just the lead; this grid grows as members are added. */
function MembersGrid({ team }: { readonly team: TeamData }) {
  // Skip blank rows the admin may have added but not filled in.
  const members = (team.members ?? []).filter((m) => m && (m.name || m.role || m.bio || m.image));
  if (members.length === 0) return null;
  return (
    <Reveal delay={0.06}>
      <div className="card">
        <span className="card__label">The Team</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginTop: 6 }}>
          {members.map((m, i) => (
            <div key={i} className="card card--hover" style={{ padding: '1rem' }}>
              {m.image && (
                <img src={m.image} alt="" loading="lazy"
                  style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover', marginBottom: 10, border: '1px solid var(--color-line)' }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
              {m.name && <h3 className="card__title" style={{ fontSize: '0.95rem', marginBottom: 2, overflowWrap: 'anywhere' }}>{m.name}</h3>}
              {m.role && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--color-holo-300)', marginBottom: m.bio ? 6 : 0, letterSpacing: '0.04em', overflowWrap: 'anywhere' }}>{m.role}</div>}
              {m.bio && <p className="body-text" style={{ fontSize: '0.82rem', overflowWrap: 'anywhere' }}>{m.bio}</p>}
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

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

const CULTURE_VALUES: readonly { readonly tag: string; readonly text: string }[] = [
  { tag: 'Craft', text: 'Small senior team. Every engineer ships to production. No bureaucracy.' },
  { tag: 'Velocity', text: 'Concept to live deployment in weeks, not quarters. Ship fast, iterate faster.' },
  { tag: 'Ownership', text: 'Full-stack ownership from game mathematics to cloud infrastructure.' },
  { tag: 'Impact', text: 'Our games are played by hundreds of thousands of real players daily.' },
];

// Fallback = the current hardcoded content; the admin (DB) overrides any field.
const TEAM_FALLBACK = {
  lead_name: LEAD.name, lead_role: LEAD.role, lead_callsign: LEAD.callsign,
  lead_location: LEAD.location, lead_company: LEAD.company, lead_experience: LEAD.experience, lead_initials: LEAD.initials,
  lead_bio: [LEAD.bio, LEAD.bio2, LEAD.bio3].join('\n\n'),
  lead_expertise: LEAD.expertise.join('\n'), lead_missions: LEAD.missions.join('\n'),
  lead_linkedin: LEAD.social.linkedin, lead_email: LEAD.social.email, lead_github: LEAD.social.github,
  members: [] as Member[],
  culture: CULTURE_VALUES as readonly { tag: string; text: string }[],
};
type TeamData = typeof TEAM_FALLBACK;

function openCareers() {
  window.dispatchEvent(new CustomEvent('open-panel', { detail: 'careers' }));
}

function SocialBtn({ href, label, icon }: { readonly href: string; readonly label: string; readonly icon: React.ReactNode }) {
  const resolved = !href.startsWith('http') && href.includes('@') ? `mailto:${href}` : href;
  return (
    <a className="icon-btn" href={safeHref(resolved)} aria-label={label} target="_blank" rel="noopener noreferrer">
      {icon}
    </a>
  );
}

function LeadershipCard({ team }: { readonly team: TeamData }) {
  // Defensive: dynamic content may be empty — never render dangling labels,
  // empty separators, or empty links that would break the page layout.
  const metaLine = [team.lead_location, team.lead_experience, team.lead_company].filter(Boolean).join(' · ');
  const expertise = lines(team.lead_expertise);
  const missions = lines(team.lead_missions);
  const bio = paras(team.lead_bio);
  const socials = [
    { href: team.lead_linkedin, label: 'LinkedIn profile', icon: <Linkedin size={16} /> },
    { href: team.lead_email, label: 'Send email', icon: <Mail size={16} /> },
    { href: team.lead_github, label: 'GitHub organisation', icon: <Github size={16} /> },
  ].filter((s) => s.href);
  return (
    <div className="card" role="article" aria-label={`Leadership: ${team.lead_name}`}>
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
                {team.lead_initials}
              </span>
            </div>
          </div>
          <div className="pulse-node" style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 14, height: 14, borderRadius: '50%',
            background: 'var(--color-live)', border: '2px solid var(--color-void-800)',
            boxShadow: '0 0 8px var(--color-live)',
          }} />
        </div>
        <div>
          <div className="card__title" style={{ marginBottom: 2, overflowWrap: 'anywhere' }}>{team.lead_name || 'Unnamed'}</div>
          {team.lead_role && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-holo-300)', overflowWrap: 'anywhere' }}>
              {team.lead_role}
            </div>
          )}
          {team.lead_callsign && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--color-gold)', marginTop: 4, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              {team.lead_callsign}
            </div>
          )}
          {metaLine && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--color-text-mute)', marginTop: 4, letterSpacing: '0.08em' }}>
              {metaLine}
            </div>
          )}
        </div>
      </div>

      {/* Bio */}
      {bio.map((p, i) => (
        <p key={i} className="body-text" style={{ marginBottom: i < bio.length - 1 ? 12 : 0, overflowWrap: 'anywhere' }}>{p}</p>
      ))}

      {expertise.length > 0 && (
        <>
          <Divider className="my-4" />
          <span className="card__label">Expertise</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {expertise.map((tag) => (
              <span key={tag} className="chip" translate="no" style={{ overflowWrap: 'anywhere' }}>{tag}</span>
            ))}
          </div>
        </>
      )}

      {missions.length > 0 && (
        <>
          <Divider className="my-4" />
          <span className="card__label">Highlights</span>
          <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {missions.map((m) => (
              <li key={m} style={{ display: 'flex', gap: 10 }}>
                <span aria-hidden="true" style={{ color: 'var(--color-holo-300)', fontFamily: 'var(--font-mono)', flexShrink: 0, lineHeight: 1.65 }}>—</span>
                <span className="body-text" style={{ overflowWrap: 'anywhere' }}>{m}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {socials.length > 0 && (
        <>
          <Divider className="my-4" />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="readout">Contact</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {socials.map((s) => <SocialBtn key={s.label} href={s.href} label={s.label} icon={s.icon} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TeamStatsCard() {
  const st = useStudioStats();
  // Games Shipped & Live Slots auto-count from the catalogue; Years & Markets are Studio Stats.
  const stats = [
    { to: st.years, suffix: '+', label: 'Years Exp' },
    { to: st.games, suffix: '', label: 'Games Shipped' },
    { to: st.slots, suffix: '', label: 'Live Slots' },
    { to: st.markets, suffix: '', label: 'Markets' },
  ];
  return (
    <div className="card">
      <span className="card__label">By the Numbers</span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 12 }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 4vw, 28px)' }}>
            {i > 0 && <Divider vertical />}
            <div className="stat">
              <CountUp className={i === 0 ? 'stat__value stat__value--accent' : 'stat__value'} to={s.to} suffix={s.suffix} />
              <span className="stat__label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CultureCard({ team }: { readonly team: TeamData }) {
  return (
    <div className="card">
      <span className="card__label">How We Work</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 4 }}>
        {team.culture.map((v) => (
          <div key={v.tag} className="card card--hover" style={{ padding: '0.8rem 0.9rem' }}>
            <h3 className="card__title" style={{ fontSize: '0.92rem', marginBottom: 4 }}>{v.tag}</h3>
            <p className="body-text" style={{ fontSize: '0.82rem' }}>{v.text}</p>
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
  const team = useSection('team', TEAM_FALLBACK);
  return (
    <SectionWrapper id="team">
      <SectionHeading
        as="h1"
        eyebrow="Team"
        title="Built by people who understand the game"
        lede="Deep expertise in game mathematics, WebGL rendering, distributed systems, and crypto-native product design — a small senior team shipping titles played by hundreds of thousands daily."
      />
      <Reveal delay={0}><LeadershipCard team={team} /></Reveal>
      <MembersGrid team={team} />
      <Reveal delay={0.08}><TeamStatsCard /></Reveal>
      <Reveal delay={0.12}><CultureCard team={team} /></Reveal>
      <Reveal delay={0.16}><JoinTeamCard /></Reveal>
    </SectionWrapper>
  );
}
