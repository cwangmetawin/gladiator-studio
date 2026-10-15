import { ARENA_PAGE_COPY } from '@/features/arena-page/pageCopy';
import { ArenaPageContent } from '@/features/arena-page/ArenaPageContent';
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

function Profile({ person, index }: { readonly person: Person; readonly index: number }) {
  const photo = safeImageSrc(person.image);
  const socials = [{ href: person.linkedin, label: 'LinkedIn profile' }, { href: person.email, label: 'Send email' }, { href: person.github, label: 'GitHub organisation' }].filter(row => row.href);
  return <article className="arena-page__section" aria-label={`Profile: ${person.name}`}>
    <span className="arena-page__number">{String(index + 1).padStart(2, '0')}</span>
    <p className="arena-page__meta">{index === 0 ? 'Leadership' : 'Profile'}</p>
    {photo ? <img className="arena-page__portrait" src={photo} alt={person.name} loading="lazy" onError={event => { event.currentTarget.hidden = true; }} /> : <p className="arena-page__meta" aria-hidden="true">{person.initials}</p>}
    <h2>{person.name || 'Unnamed'}</h2>
    {person.role && <p>{person.role}</p>}{person.callsign && <p className="arena-page__meta">{person.callsign}</p>}
    <p className="arena-page__meta">{[person.location, person.experience, person.company].filter(Boolean).join(' · ')}</p>
    {paras(person.bio).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
    {lines(person.expertise).length > 0 && <><h3>Expertise</h3><ul className="arena-page__dots">{lines(person.expertise).map(tag => <li key={tag} translate="no">{tag}</li>)}</ul></>}
    {lines(person.missions).length > 0 && <><h3>Highlights</h3><ul className="arena-page__dots">{lines(person.missions).map(item => <li key={item}>{item}</li>)}</ul></>}
    <div className="arena-page__actions">{socials.map(row => <a className="arena-page__action" key={row.label} href={safeHref(!row.href.startsWith('http') && row.href.includes('@') ? `mailto:${row.href}` : row.href)} target="_blank" rel="noopener noreferrer">{row.label}</a>)}</div>
  </article>;
}

export function TeamSection({ titleId, bodyOnly = false }: { readonly titleId: string; readonly bodyOnly?: boolean }) {
  const team = useSection('team', teamDefault as unknown as TeamData), s = useStudioStats();
  const all = (team.people ?? []).filter(p => p && (p.name || p.role || p.bio));
  const people = all.length > 0 ? all : teamDefault.people as unknown as Person[];
  return <ArenaPageContent titleId={titleId} bodyOnly={bodyOnly} {...ARENA_PAGE_COPY.team}>
    {people.map((person, i) => <Profile key={`${person.name}-${i}`} person={person} index={i} />)}
    <section className="arena-page__section"><h2>By the Numbers</h2><dl className="arena-page__stats">
      <div><dt>Years Exp</dt><dd>{s.years}+</dd></div><div><dt>Games Shipped</dt><dd>{s.games}</dd></div>
      <div><dt>Live Slots</dt><dd>{s.slots}</dd></div><div><dt>Markets</dt><dd>{s.markets}</dd></div>
    </dl></section>
    <section className="arena-page__section"><h2>How We Work</h2><ul className="arena-page__rows">{(team.culture ?? []).filter(row => row && (row.tag || row.text)).map((row, i) => <li key={i}><h3>{row.tag}</h3><p>{row.text}</p></li>)}</ul></section>
    <section className="arena-page__section"><h2>Join the Team</h2><p>We hire senior talent across engineering, design, and product on a rolling basis. If you are exceptional at what you do and want to build games that real players use daily, we want to hear from you.</p>
      <button className="arena-page__action" type="button" onClick={openCareers}>Join the Team</button>
    </section>
  </ArenaPageContent>;
}
