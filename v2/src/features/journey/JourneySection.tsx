import { useState } from 'react';
import { motion } from 'framer-motion';
import { SectionWrapper } from '@/shared/components/SectionWrapper';
import { SectionHeading, Reveal } from '@/shared/ui';
import { useSection } from '@/shared/content/SiteContentContext';
import journeyDefault from '@/api/journeyDefault.json';

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
function toTitleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

const EXPO = [0.16, 1, 0.3, 1] as const;

function MilestoneRow({ m, index, isLast }: { readonly m: Mission; readonly index: number; readonly isLast: boolean }) {
  const cfg = STATUS_CONFIG[m.status];
  const [hover, setHover] = useState(false);
  const lit = hover || m.status === 'ACTIVE';

  return (
    <Reveal delay={index * 0.06}>
      <li
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ display: 'grid', gridTemplateColumns: '16px 1fr', columnGap: 16, paddingBottom: isLast ? 0 : 26 }}
      >
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
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
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
      </li>
    </Reveal>
  );
}

export function JourneySection() {
  const journey = useSection('journey', journeyDefault as JourneyContent);
  const milestones: Mission[] = (journey.milestones ?? [])
    .filter((m) => m && m.title)
    .map((m) => ({
      date: m.date,
      title: m.title,
      description: m.description,
      status: (VALID_STATUS.has(m.status) ? m.status : 'QUEUED') as Mission['status'],
    }));
  return (
    <SectionWrapper id="journey">
      <SectionHeading
        as="h1"
        eyebrow="Journey"
        title="Timeline"
        lede="From founding to 34 live titles across 7 markets."
      />

      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {milestones.map((m, i) => (
          <MilestoneRow key={`${m.date}-${i}`} m={m} index={i} isLast={i === milestones.length - 1} />
        ))}
      </ol>
    </SectionWrapper>
  );
}
