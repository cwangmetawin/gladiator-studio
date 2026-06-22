import { SectionWrapper } from '@/shared/components/SectionWrapper';
import { SectionHeading } from '@/shared/ui';

interface Mission {
  readonly date: string;
  readonly title: string;
  readonly description: string;
  readonly status: 'COMPLETE' | 'ACTIVE' | 'QUEUED';
}

const MISSIONS: readonly Mission[] = [
  {
    date: 'Q3 2023',
    title: 'STUDIO FOUNDED',
    description: 'Gladiator Studio established as in-house game division of MetaWin. Mandate: build crypto-native, high-volatility slot content for MetaWin and third-party operators.',
    status: 'COMPLETE',
  },
  {
    date: 'Q4 2023',
    title: 'FIRST TITLE DEPLOYED',
    description: '“To The Top” launched as inaugural slot — introduced the studio signature escalating-multiplier mechanic and established ULTRA-volatility market positioning.',
    status: 'COMPLETE',
  },
  {
    date: 'Q1 2024',
    title: 'CATALOGUE EXPANSION',
    description: 'Five additional slots shipped: Legend of Tartarus, Rise of Cetus, Star Nudge, Disco Dazzle, Sweety Treaty. Gladiator cemented as a prolific, quality-first content producer.',
    status: 'COMPLETE',
  },
  {
    date: 'Q2 2024',
    title: 'OPERATOR PARTNERSHIPS',
    description: 'Distribution agreements secured with Rolla and WowVegas. Gladiator catalogue extended beyond MetaWin to third-party platforms — B2B commercial model validated.',
    status: 'COMPLETE',
  },
  {
    date: 'Q4 2024',
    title: 'INFRASTRUCTURE SCALE',
    description: 'Feeder system upgraded for global real-time bet data. Live integration across 7 markets with sub-100ms round-trip performance benchmarks met in production.',
    status: 'COMPLETE',
  },
  {
    date: '2025',
    title: '34 GAMES MILESTONE',
    description: '8 Gladiator slots + 26 MetaWin Originals live across the platform. Full catalogue available through single API integration for all operator partners.',
    status: 'COMPLETE',
  },
  {
    date: '2026+',
    title: 'GLOBAL ROLLOUT',
    description: 'Active expansion into new regulated markets. Additional titles in production. Aggregator partnerships in negotiation. Entering highest-output phase.',
    status: 'ACTIVE',
  },
] as const;

/** Maps a milestone status to its semantic accent token + display label. */
const STATUS_CONFIG: Record<Mission['status'], { readonly color: string; readonly label: string }> = {
  COMPLETE: { color: 'var(--color-holo-500)', label: 'Complete' },
  ACTIVE: { color: 'var(--color-live)', label: 'Active' },
  QUEUED: { color: 'var(--color-text-dim)', label: 'Queued' },
} as const;

/** Converts a SCREAMING title (e.g. "STUDIO FOUNDED") to Title Case. */
function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function JourneySection() {
  return (
    <SectionWrapper id="journey">
      <SectionHeading
        as="h1"
        eyebrow="Journey"
        title="Timeline"
        lede="From founding to 34 live titles across 7 markets."
      />

      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {MISSIONS.map((m, i) => {
          const cfg = STATUS_CONFIG[m.status];
          const isLast = i === MISSIONS.length - 1;
          return (
            <li
              key={m.date}
              style={{
                display: 'grid',
                gridTemplateColumns: '14px 1fr',
                columnGap: 16,
                paddingBottom: isLast ? 0 : 24,
              }}
            >
              {/* Connector rail: node dot + vertical hairline */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    marginTop: 5,
                    flexShrink: 0,
                    border: `1px solid ${cfg.color}`,
                    background: `radial-gradient(circle, ${cfg.color} 0%, transparent 72%)`,
                    boxShadow: `0 0 10px ${cfg.color}`,
                  }}
                />
                {!isLast && (
                  <span
                    aria-hidden="true"
                    style={{
                      width: 1,
                      flex: 1,
                      marginTop: 6,
                      background: 'linear-gradient(180deg, var(--color-line), transparent)',
                    }}
                  />
                )}
              </div>

              {/* Milestone content */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <time
                    dateTime={m.date}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-2xs)',
                      fontWeight: 600,
                      letterSpacing: 'var(--tracking-label)',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-mute)',
                    }}
                  >
                    {m.date}
                  </time>
                  <span
                    className="chip"
                    style={{ color: cfg.color, borderColor: cfg.color }}
                  >
                    {cfg.label}
                  </span>
                </div>

                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: '1.05rem',
                    letterSpacing: '-0.005em',
                    color: 'var(--color-ice-50)',
                  }}
                >
                  {toTitleCase(m.title)}
                </h3>

                <p className="body-text">{m.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </SectionWrapper>
  );
}
