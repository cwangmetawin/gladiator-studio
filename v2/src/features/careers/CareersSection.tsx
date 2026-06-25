import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SectionWrapper } from '@/shared/components/SectionWrapper';
import { SectionHeading, Button, Divider, CountUp } from '@/shared/ui';
import { useSection } from '@/shared/content/SiteContentContext';
import { lines, safeHref } from '@/shared/utils/text';
import careersDefault from '@/api/careersDefault.json';

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

// Editable (DB) shape — requirements/niceToHave are newline strings.
interface ContentPosition {
  readonly id?: string;
  readonly title: string;
  readonly department: string;
  readonly location: string;
  readonly type: string;
  readonly summary: string;
  readonly description: string;
  readonly requirements: string;
  readonly niceToHave: string;
  readonly applyUrl: string;
}


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

  const careers = useSection('careers', careersDefault as { apply_email: string; positions: ContentPosition[] });
  const applyEmail = careers.apply_email || 'cwang@metawin.inc';
  // Build render-ready jobs from editable content; skip blank rows, split lists,
  // and sanitise the apply link (it's admin-editable now).
  const jobs: JobListing[] = (careers.positions ?? [])
    .filter((p) => p && p.title)
    .map((p, i) => ({
      id: p.id || `pos-${i}`,
      title: p.title, department: p.department, location: p.location, type: p.type,
      summary: p.summary, description: p.description,
      requirements: lines(p.requirements), niceToHave: lines(p.niceToHave),
      applyUrl: safeHref(p.applyUrl),
    }));
  const cvHref = safeHref(`mailto:${applyEmail}?subject=${encodeURIComponent('Speculative Application — Gladiator Studio')}`);

  return (
    <SectionWrapper id="careers">
      <SectionHeading
        as="h1"
        eyebrow="Careers"
        title="Open Positions"
        lede="Gladiator Studio is a small, senior team building the games behind MetaWin — one of the world's most-played crypto casinos. We hire for craft, move fast, and ship to production constantly."
      />

      <p className="readout" style={{ marginTop: -10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="pulse-node" aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-live)', boxShadow: '0 0 8px var(--color-live)' }} />
        <CountUp to={jobs.length} className="readout__value" /> open roles · hiring on a rolling basis
      </p>

      {/* Job cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {jobs.map((job, index) => (
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
