import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Github, Linkedin, Mail } from 'lucide-react';
import { SectionWrapper } from '@/shared/components/SectionWrapper';
import { SectionHeading, Button, Divider, Reveal, CountUp } from '@/shared/ui';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
import { lines, paras, safeHref, safeImageSrc } from '@/shared/utils/text';
import teamDefault from '@/api/teamDefault.json';

interface Person {
  readonly name: string;
  readonly role: string;
  readonly callsign: string;
  readonly initials: string;
  readonly location: string;
  readonly company: string;
  readonly experience: string;
  readonly image: string;
  readonly bio: string;
  readonly expertise: string | readonly string[];
  readonly missions: string | readonly string[];
  readonly linkedin: string;
  readonly email: string;
  readonly github: string;
}
interface TeamData {
  readonly people: readonly Person[];
  readonly culture: readonly { readonly tag: string; readonly text: string }[];
}

function openCareers() {
  window.dispatchEvent(new CustomEvent('open-panel', { detail: 'careers' }));
}

function SocialBtn({ href, label, icon }: { readonly href: string; readonly label: string; readonly icon: React.ReactNode }) {
  const h = String(href ?? '');
  const resolved = !h.startsWith('http') && h.includes('@') ? `mailto:${h}` : h;
  return (
    <a className="icon-btn" href={safeHref(resolved)} aria-label={label} target="_blank" rel="noopener noreferrer">
      {icon}
    </a>
  );
}

const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

/** A single person's full profile. Identical to the old single-lead card; one of
 *  these renders per tab when there are multiple people. */
function ProfileCard({ person, label }: { readonly person: Person; readonly label: string }) {
  const metaLine = [person.location, person.experience, person.company].filter(Boolean).join(' · ');
  const expertise = lines(person.expertise);
  const missions = lines(person.missions);
  const bio = paras(person.bio);
  const photo = safeImageSrc(person.image);
  const socials = [
    { href: person.linkedin, label: 'LinkedIn profile', icon: <Linkedin size={16} /> },
    { href: person.email, label: 'Send email', icon: <Mail size={16} /> },
    { href: person.github, label: 'GitHub organisation', icon: <Github size={16} /> },
  ].filter((s) => s.href);
  const [expanded, setExpanded] = useState(false);
  const hasMore = bio.length > 1 || missions.length > 0;

  return (
    <div className="card" role="article" aria-label={`${label}: ${person.name}`}>
      <span className="card__label">{label}</span>

      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div aria-hidden="true" style={{ position: 'relative', width: 56, height: 62, flexShrink: 0 }}>
          {photo ? (
            <img src={photo} alt="" style={{ width: 56, height: 62, objectFit: 'cover', clipPath: HEX_CLIP }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div style={{ width: 56, height: 62, clipPath: HEX_CLIP, background: 'var(--color-holo-500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 52, height: 58, clipPath: HEX_CLIP, background: 'var(--color-void-800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700, color: 'var(--color-holo-300)', letterSpacing: 2 }}>
                  {person.initials}
                </span>
              </div>
            </div>
          )}
          <div className="pulse-node" style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: 'var(--color-live)', border: '2px solid var(--color-void-800)', boxShadow: '0 0 8px var(--color-live)' }} />
        </div>
        <div>
          <div className="card__title" style={{ marginBottom: 2, overflowWrap: 'anywhere' }}>{person.name || 'Unnamed'}</div>
          {person.role && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-holo-300)', overflowWrap: 'anywhere' }}>{person.role}</div>}
          {person.callsign && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--color-gold)', marginTop: 4, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{person.callsign}</div>}
          {metaLine && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--color-text-mute)', marginTop: 4, letterSpacing: '0.08em' }}>{metaLine}</div>}
        </div>
      </div>

      {bio[0] && <p className="body-text" style={{ overflowWrap: 'anywhere' }}>{bio[0]}</p>}

      {expertise.length > 0 && (
        <>
          <Divider className="my-4" />
          <span className="card__label">Expertise</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {expertise.map((tag) => <span key={tag} className="chip" translate="no" style={{ overflowWrap: 'anywhere' }}>{tag}</span>)}
          </div>
        </>
      )}

      <AnimatePresence initial={false}>
        {expanded && hasMore && (
          <motion.div key="more" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} style={{ overflow: 'hidden' }}>
            {bio.slice(1).map((p, i) => <p key={i} className="body-text" style={{ marginTop: 12, overflowWrap: 'anywhere' }}>{p}</p>)}
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
          </motion.div>
        )}
      </AnimatePresence>

      {hasMore && (
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
          style={{ marginTop: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-holo-300)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', letterSpacing: '0.14em', textTransform: 'uppercase', padding: 0 }}>
          {expanded ? 'Show less ▴' : 'Read more ▾'}
        </button>
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

function CultureCard({ culture }: { readonly culture: TeamData['culture'] }) {
  const values = (culture ?? []).filter((v) => v && (v.tag || v.text));
  if (values.length === 0) return null;
  return (
    <div className="card">
      <span className="card__label">How We Work</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 4 }}>
        {values.map((v, i) => (
          <div key={i} className="card card--hover" style={{ padding: '0.8rem 0.9rem' }}>
            {v.tag && <h3 className="card__title" style={{ fontSize: '0.92rem', marginBottom: 4 }}>{v.tag}</h3>}
            {v.text && <p className="body-text" style={{ fontSize: '0.82rem' }}>{v.text}</p>}
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
  const team = useSection('team', teamDefault as unknown as TeamData);
  const all = (team.people ?? []).filter((p) => p && (p.name || p.role || p.bio));
  const people: readonly Person[] = all.length > 0 ? all : (teamDefault.people as unknown as Person[]);
  const [active, setActive] = useState(0);
  const idx = Math.min(active, people.length - 1);
  const person = people[idx] ?? people[0];
  const multi = people.length > 1;

  return (
    <SectionWrapper id="team">
      <SectionHeading
        as="h1"
        eyebrow="Team"
        title="Built by people who understand the game"
        lede="Deep expertise in game mathematics, WebGL rendering, distributed systems, and crypto-native product design — a small senior team shipping titles played by hundreds of thousands daily."
      />

      {/* Tabs — only when there's more than one person */}
      {multi && (
        <Reveal delay={0}>
          <div role="tablist" aria-label="Team members" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {people.map((p, i) => {
              const on = i === idx;
              return (
                <button key={i} type="button" role="tab" aria-selected={on} onClick={() => setActive(i)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, cursor: 'pointer',
                    padding: '8px 14px', borderRadius: 10, textAlign: 'left',
                    background: on ? 'var(--holo-tint-2)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${on ? 'var(--color-holo-500)' : 'var(--color-line)'}`,
                    transition: 'background 0.18s, border-color 0.18s',
                  }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.92rem', color: on ? '#fff' : 'var(--color-text-soft)' }}>{p.name || `Person ${i + 1}`}</span>
                  {p.role && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: on ? 'var(--color-holo-300)' : 'var(--color-text-mute)', letterSpacing: '0.04em' }}>{p.role}</span>}
                </button>
              );
            })}
          </div>
        </Reveal>
      )}

      <Reveal delay={0.04}>
        <AnimatePresence mode="wait">
          <motion.div key={idx} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            {person && <ProfileCard person={person} label={multi ? 'Profile' : 'Leadership'} />}
          </motion.div>
        </AnimatePresence>
      </Reveal>

      <Reveal delay={0.08}><TeamStatsCard /></Reveal>
      <Reveal delay={0.12}><CultureCard culture={team.culture} /></Reveal>
      <Reveal delay={0.16}><JoinTeamCard /></Reveal>
    </SectionWrapper>
  );
}
