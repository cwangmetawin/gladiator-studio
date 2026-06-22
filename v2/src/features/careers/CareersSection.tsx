import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SectionWrapper } from '@/shared/components/SectionWrapper';
import { SectionHeading, Button, Divider } from '@/shared/ui';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface JobListing {
  readonly id: string;
  readonly title: string;
  readonly department: string;
  readonly location: string;
  readonly type: string;
  readonly summary: string;
  readonly description: string;
  readonly requirements: readonly string[];
  readonly niceToHave: readonly string[];
  readonly applyUrl: string;
}

const APPLY_EMAIL = 'cwang@metawin.inc';

const JOB_LISTINGS: readonly JobListing[] = [
  {
    id: 'lead-ai-game-engineer',
    title: 'LEAD AI GAME ENGINEER',
    department: 'Engineering — AI Division',
    location: 'Remote / London',
    type: 'Full-time',
    summary: 'Lead the development of AI-powered game systems — the first role of its kind in iGaming.',
    description: "Architect intelligent game mechanics, ML-driven player experience optimization, and autonomous agent systems for next-generation slot titles. You'll build the AI infrastructure that gives Gladiator Studio its competitive edge — from LLM-powered content generation to real-time adaptive game balancing.",
    requirements: [
      '5+ years game development with AI/ML integration',
      'Strong ML/AI background (PyTorch, TensorFlow, LLM APIs)',
      'Experience with autonomous agent systems and multi-agent orchestration',
      'Real-time systems and low-latency inference',
      'Game mathematics and RNG knowledge',
    ],
    niceToHave: [
      'Experience with Claude API, OpenAI, or similar LLM platforms',
      'Reinforcement learning for game balancing',
      'iGaming regulatory compliance experience',
    ],
    applyUrl: 'https://careers.arenaentertainment.com/jobs/7371186-lead-ai-game-engineer',
  },
  {
    id: 'senior-pixijs-dev',
    title: 'SENIOR PIXI.JS DEVELOPER',
    department: 'Engineering',
    location: 'London, UK (Hybrid)',
    type: 'Full-time',
    summary: 'Build the front-end rendering layer for ULTRA-volatility slot games played by hundreds of thousands of MetaWin users.',
    description: 'Own the Pixi.js rendering pipeline for Gladiator slot titles — reel animation state machines, particle effects, symbol transitions, and bonus round sequences. Ship real titles to a production player base. Build new mechanics and push what the browser can do.',
    requirements: [
      '5+ years JavaScript/TypeScript development',
      '3+ years Pixi.js in production game environment',
      'Deep understanding of WebGL and GPU-accelerated 2D rendering',
      'Experience shipping browser-based games',
      'Strong eye for animation quality and frame-rate performance',
    ],
    niceToHave: [
      'Slot game mechanics experience (reels, paylines, bonus rounds)',
      'WebAssembly for performance-critical rendering paths',
      'Open-source contributions (Pixi.js community valued)',
    ],
    applyUrl: `mailto:${APPLY_EMAIL}?subject=${encodeURIComponent('Application — Senior Pixi.js Developer')}`,
  },
  {
    id: 'game-math-engineer',
    title: 'GAME MATHEMATICIAN / RNG SPECIALIST',
    department: 'Mathematics & Compliance',
    location: 'Remote (UK/EU)',
    type: 'Full-time / Contract',
    summary: 'Design the probability models and paytable mathematics for ULTRA-volatility slot titles.',
    description: 'Own the mathematical design of Gladiator slots — RTP distributions, volatility profiles, feature trigger frequencies, and peak win ceilings. Validate maths through simulation (10^9+ rounds). Produce audit-ready documentation for operator partners.',
    requirements: [
      'Degree in Mathematics, Statistics, or equivalent quantitative field',
      '3+ years slot game mathematics experience',
      'Proficiency in simulation tools (custom or industry-standard)',
      'Familiarity with regulatory RTP certification (MGA, UKGC)',
      'Clear communication of mathematical designs to non-specialists',
    ],
    niceToHave: [
      'Experience with provably fair / blockchain-based RNG',
      'BigQuery or similar for production telemetry analysis',
    ],
    applyUrl: `mailto:${APPLY_EMAIL}?subject=${encodeURIComponent('Application — Game Mathematician')}`,
  },
  {
    id: 'art-director',
    title: 'ART DIRECTOR',
    department: 'Creative',
    location: 'London, UK (Hybrid)',
    type: 'Full-time',
    summary: 'Define the visual language of next-generation slot titles and lead the creative team.',
    description: 'Set the visual standard for every new Gladiator title — concept and character design through to final asset delivery and in-engine integration. Manage artists and freelance contributors. Own creative briefs with game designers. Report directly to the CTO.',
    requirements: [
      '7+ years game art direction with slot game portfolio',
      'Full game art pipeline: concept, 2D illustration, animation brief, UI',
      'Experience managing artists within production schedules',
      'Knowledge of Pixi.js or equivalent 2D game engine asset integration',
      'Ability to context-switch between multiple concurrent titles',
    ],
    niceToHave: [
      'Crypto casino or social casino environment experience',
      'Motion design skills (After Effects or equivalent)',
      'Understanding of art style impact on player conversion',
    ],
    applyUrl: `mailto:${APPLY_EMAIL}?subject=${encodeURIComponent('Application — Art Director')}`,
  },
  {
    id: 'backend-engineer',
    title: 'BACKEND ENGINEER',
    department: 'Engineering',
    location: 'Remote / London',
    type: 'Full-time',
    summary: 'Build and scale the game server infrastructure behind 34 live titles across 7 markets.',
    description: 'Architect and maintain game backend services — bet processing, RNG integration, real-time feeder data pipeline, and operator API layer. Work with AWS and GCP across multiple regions. Sub-100ms round-trip is the baseline, not the goal.',
    requirements: [
      '5+ years backend development (Node.js / TypeScript preferred)',
      'Experience with AWS (EC2, Lambda, CloudFront, RDS) or GCP',
      'Strong understanding of distributed systems and high-throughput APIs',
      'Database design and optimization (SQL + NoSQL)',
      'Experience with real-time data streaming',
    ],
    niceToHave: [
      'iGaming or fintech backend experience',
      'BigQuery / data pipeline architecture',
      'Blockchain / crypto transaction processing',
    ],
    applyUrl: `mailto:${APPLY_EMAIL}?subject=${encodeURIComponent('Application — Backend Engineer')}`,
  },
  {
    id: 'qa-engineer',
    title: 'QA ENGINEER',
    department: 'Quality Assurance',
    location: 'Remote / London',
    type: 'Full-time',
    summary: 'Ensure every game ships at the quality standard MetaWin players expect.',
    description: 'Own the QA process for Gladiator slot titles — functional testing, RTP validation, performance benchmarking, cross-browser/device compatibility, and regression testing. Build automated test frameworks for game mechanics and integration endpoints.',
    requirements: [
      '3+ years QA experience in gaming or interactive applications',
      'Experience with automated testing frameworks',
      'Understanding of game mechanics testing and edge cases',
      'Cross-browser and mobile device testing expertise',
      'Strong attention to detail and systematic approach',
    ],
    niceToHave: [
      'iGaming QA experience (slot games, RNG validation)',
      'Performance profiling tools (Chrome DevTools, Lighthouse)',
      'Statistical validation of game mathematics',
    ],
    applyUrl: `mailto:${APPLY_EMAIL}?subject=${encodeURIComponent('Application — QA Engineer')}`,
  },
] as const;

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Tokens that must keep their casing when a SCREAMING_SNAKE title is humanised. */
const TITLE_ACRONYMS: Readonly<Record<string, string>> = {
  AI: 'AI',
  RNG: 'RNG',
  QA: 'QA',
  UI: 'UI',
  'PIXI.JS': 'Pixi.js',
};

/** Convert a SCREAMING title to Title Case while preserving known acronyms. */
function toTitleCase(title: string): string {
  return title
    .split(' ')
    .map((word) => {
      const acronym = TITLE_ACRONYMS[word];
      if (acronym) return acronym;
      if (word === '/') return '/';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const DETAILS_VARIANTS = {
  collapsed: { height: 0, opacity: 0, transition: { duration: 0.22 } },
  expanded: { height: 'auto' as const, opacity: 1, transition: { duration: 0.26 } },
} as const;

const READOUT_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-2xs)',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--color-text-mute)',
};

const SMALL_LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-2xs)',
  fontWeight: 600,
  letterSpacing: 'var(--tracking-label)',
  textTransform: 'uppercase',
  color: 'var(--color-holo-300)',
  display: 'block',
  marginBottom: 8,
};

const SMALL_LABEL_MUTE_STYLE: React.CSSProperties = {
  ...SMALL_LABEL_STYLE,
  color: 'var(--color-text-mute)',
};

interface JobBulletProps {
  readonly children: React.ReactNode;
  readonly muted?: boolean;
}

function JobBullet({ children, muted = false }: JobBulletProps) {
  return (
    <li
      className="body-text"
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        color: muted ? 'var(--color-text-mute)' : 'var(--color-text-soft)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          marginTop: 7,
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: muted ? 'var(--color-text-dim)' : 'var(--color-holo-500)',
          boxShadow: muted ? 'none' : '0 0 8px var(--color-holo-500)',
        }}
      />
      <span>{children}</span>
    </li>
  );
}

interface JobCardProps {
  readonly job: JobListing;
  readonly index: number;
  readonly showDetails: boolean;
  readonly onToggleDetails: (id: string) => void;
}

function JobCard({ job, index, showDetails, onToggleDetails }: JobCardProps) {
  const detailsId = `job-details-${job.id}`;

  return (
    <motion.div
      className="card card--hover"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: index * 0.08 }}
    >
      <h3 className="card__title">{toTitleCase(job.title)}</h3>
      <div style={{ ...READOUT_STYLE, marginBottom: 8 }}>
        {job.department} · {job.location} · {job.type}
      </div>
      <p className="body-text" style={{ marginBottom: 12 }}>
        {job.summary}
      </p>
      <Divider className="mb-3" />

      <AnimatePresence initial={false}>
        {showDetails && (
          <motion.div
            key="details"
            id={detailsId}
            variants={DETAILS_VARIANTS}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            style={{ overflow: 'hidden' }}
          >
            <p className="body-text" style={{ marginBottom: 14 }}>
              {job.description}
            </p>

            <span style={SMALL_LABEL_STYLE}>Requirements</span>
            <ul
              style={{
                margin: '0 0 14px 0',
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              {job.requirements.map((r) => (
                <JobBullet key={r}>{r}</JobBullet>
              ))}
            </ul>

            {job.niceToHave.length > 0 && (
              <>
                <span style={SMALL_LABEL_MUTE_STYLE}>Nice to Have</span>
                <ul
                  style={{
                    margin: '0 0 14px 0',
                    padding: 0,
                    listStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                  }}
                >
                  {job.niceToHave.map((r) => (
                    <JobBullet key={r} muted>
                      {r}
                    </JobBullet>
                  ))}
                </ul>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button
          variant="secondary"
          onClick={() => onToggleDetails(job.id)}
          aria-expanded={showDetails}
          aria-controls={detailsId}
        >
          {showDetails ? 'Hide' : 'Details'}
        </Button>
        <Button variant="primary" href={job.applyUrl} target="_blank" rel="noopener noreferrer">
          Apply
        </Button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CareersSection() {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());

  function handleToggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next as ReadonlySet<string>;
    });
  }

  const cvHref = `mailto:${APPLY_EMAIL}?subject=${encodeURIComponent('Speculative Application — Gladiator Studio')}`;

  return (
    <SectionWrapper id="careers">
      <SectionHeading
        as="h1"
        eyebrow="Careers"
        title="Open Positions"
        lede="Gladiator Studio is a small, senior team building the games behind MetaWin — one of the world's most-played crypto casinos. We hire for craft, move fast, and ship to production constantly."
      />

      {/* Job cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {JOB_LISTINGS.map((job, index) => (
          <JobCard
            key={job.id}
            job={job}
            index={index}
            showDetails={expandedIds.has(job.id)}
            onToggleDetails={handleToggle}
          />
        ))}
      </div>

      {/* Speculative CTA */}
      <motion.div
        className="card"
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
      >
        <h3 className="card__title">Role Not Listed?</h3>
        <p className="body-text" style={{ marginBottom: 14 }}>
          We hire senior talent across engineering, design, and product on a rolling basis. If you are
          exceptional at what you do and want to work on games that real players use daily, send us your
          dossier.
        </p>
        <Button variant="primary" href={cvHref}>
          Get in Touch
        </Button>
      </motion.div>
    </SectionWrapper>
  );
}
