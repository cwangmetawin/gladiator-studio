import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useMotionPreference } from '@/shared/motion/useMotionPreference';
import { SectionWrapper } from '@/shared/components/SectionWrapper';
import { SectionHeading, Reveal } from '@/shared/ui';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
import { withCatalogueCounts } from '@/shared/utils/catalogueText';
import journeyDefault from '@/api/journeyDefault.json';
import { groupJourneyChapters } from './chapters';
import { journeyMotion } from './journeyMotion';

interface JourneyContent {
  readonly milestones: readonly { readonly date: string; readonly title: string; readonly description: string; readonly status: string }[];
}
const VALID_STATUS = new Set(['COMPLETE', 'ACTIVE', 'QUEUED']);

interface Mission {
  readonly date: string;
  readonly title: string;
  readonly description: string;
  readonly status: 'COMPLETE' | 'ACTIVE' | 'QUEUED';
}


/** Maps a milestone status to its semantic accent token + display label. */
const STATUS_CONFIG: Record<Mission['status'], { readonly color: string; readonly label: string }> = {
  COMPLETE: { color: 'var(--color-holo-500)', label: 'Complete' },
  ACTIVE: { color: 'var(--color-live)', label: 'Active' },
  QUEUED: { color: 'var(--color-text-dim)', label: 'Queued' },
} as const;

/** Converts a SCREAMING title (e.g. "STUDIO FOUNDED") to Title Case. */
function toTitleCase(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

const EXPO = [0.16, 1, 0.3, 1] as const;

function MilestoneRow({ m, index, isLast }: { readonly m: Mission; readonly index: number; readonly isLast: boolean }) {
  const cfg = STATUS_CONFIG[m.status];
  const [hover, setHover] = useState(false);
  const reducedMotion = useMotionPreference();
  const lit = hover || m.status === 'ACTIVE';

  return (
    <li onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Reveal delay={index * 0.06}>
        <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr', columnGap: 16, paddingBottom: isLast ? 0 : 26 }}>
          {/* Connector rail: node + drawing hairline */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span
              aria-hidden="true"
              className={m.status === 'ACTIVE' ? 'pulse-node' : undefined}
              style={{
                width: 12, height: 12, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                border: `1px solid ${cfg.color}`,
                background: `radial-gradient(circle, ${cfg.color} 0%, transparent 72%)`,
                boxShadow: `0 0 ${lit ? 16 : 9}px ${cfg.color}`,
                transform: lit ? 'scale(1.25)' : 'scale(1)',
                transition: 'transform 0.25s var(--ease-out-expo), box-shadow 0.25s var(--ease-out-expo)',
              }}
            />
            {!isLast && (
              <motion.span
                aria-hidden="true"
                initial={reducedMotion ? false : { scaleY: 0 }}
                animate={reducedMotion ? { scaleY: 1 } : undefined}
                whileInView={reducedMotion ? undefined : { scaleY: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: index * 0.06 + 0.12, ease: EXPO }}
                style={{ width: 1, flex: 1, marginTop: 6, transformOrigin: 'top', background: 'linear-gradient(180deg, var(--color-line-bright), transparent)' }}
              />
            )}
          </div>

          {/* Milestone content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, transform: hover ? 'translateX(4px)' : 'none', transition: 'transform 0.25s var(--ease-out-expo)' }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <time dateTime={m.date} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: lit ? cfg.color : 'var(--color-text-mute)', transition: 'color 0.25s' }}>
                {m.date}
              </time>
              <span className="chip" style={{ color: cfg.color, borderColor: cfg.color }}>{cfg.label}</span>
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.05rem', letterSpacing: '-0.005em', color: lit ? '#fff' : 'var(--color-ice-50)', transition: 'color 0.25s' }}>
              {toTitleCase(m.title)}
            </h3>
            <p className="body-text">{m.description}</p>
          </div>
        </div>
      </Reveal>
    </li>
  );
}

export function JourneySection() {
  const s = useStudioStats();
  const journey = useSection('journey', journeyDefault as JourneyContent);
  const milestones: Mission[] = (journey.milestones ?? [])
    .filter((m) => m && m.title)
    .map((m) => ({
      date: m.date,
      title: m.title,
      description: m.description,
      status: (VALID_STATUS.has(m.status) ? m.status : 'QUEUED') as Mission['status'],
    }));
  const chapters = groupJourneyChapters(milestones);
  useEffect(() => { journeyMotion.setCount(chapters.length); }, [chapters.length]);
  return (
    <SectionWrapper id="journey">
      <SectionHeading
        as="h1"
        eyebrow="Journey"
        title="Timeline"
        lede={withCatalogueCounts('From founding to {{games}} live titles across 7 markets.', s)}
      />

      {chapters.map(chapter => (
        <div key={chapter.index} data-chapter={chapter.index + 1}>
          <Reveal>
            <h2 className="eyebrow" style={{ color: 'var(--color-holo-300)', marginBottom: 20, flexWrap: 'wrap', overflowWrap: 'anywhere' }}>
              {String(chapter.index + 1).padStart(2, '0')} · {chapter.label}
              <span style={{ color: 'var(--color-text-dim)' }}>{chapter.milestones[0]?.date} — {chapter.milestones.at(-1)?.date}</span>
            </h2>
          </Reveal>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {chapter.milestones.map((m, i) => (
              <MilestoneRow key={`${m.date}-${i}`} m={m} index={i} isLast={i === chapter.milestones.length - 1} />
            ))}
          </ol>
        </div>
      ))}
    </SectionWrapper>
  );
}
