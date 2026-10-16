import { useState } from 'react';
import { ARENA_PAGE_COPY } from '@/features/arena-page/pageCopy';
import { ArenaPageContent } from '@/features/arena-page/ArenaPageContent';
import { EditorialChapter, EditorialCounter, EditorialIndex } from '@/features/arena-page/Editorial';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
import { lines, paras, safeHref, safeImageSrc } from '@/shared/utils/text';
import { withStudioMarkets } from '@/shared/utils/studioText';
import teamDefault from '@/api/teamDefault.json';
import './teamDossier.css';

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

function Profile({ person, index, markets }: { readonly person: Person; readonly index: number; readonly markets: number }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const photo = safeImageSrc(person.image);
  const hasPhoto = Boolean(photo && photo !== failedPhoto);
  const expertise = lines(person.expertise).map(text => withStudioMarkets(text, { markets }));
  const highlights = lines(person.missions).map(text => withStudioMarkets(text, { markets }));
  const socials = [{ href: person.linkedin, label: 'LinkedIn profile' }, { href: person.email, label: 'Send email' }, { href: person.github, label: 'GitHub organisation' }].filter(row => row.href);
  return <EditorialChapter id={`team-person-${index + 1}`} number={String(index + 1).padStart(2, '0')}
    kicker={index === 0 ? 'Leadership' : 'Profile'} title={person.name || 'Unnamed'} deck={person.role}
    className={`editorial-dossier editorial-dossier--${hasPhoto ? 'photo' : 'monogram'}`}
    titleCompanion={!hasPhoto ? <figure className="editorial-dossier__image editorial-dossier__image--monogram">
      <span className="editorial-dossier__initials" aria-hidden="true">{person.initials}</span>
    </figure> : undefined}>
    <div className="editorial-dossier__layout">
      {hasPhoto && <figure className="editorial-dossier__image">
        <img className="editorial-dossier__portrait" src={photo} alt={person.name} loading="lazy" onError={() => setFailedPhoto(photo)} />
      </figure>}
      <div className="editorial-dossier__copy">
        {person.callsign && <p className="arena-page__meta">{person.callsign}</p>}
        <p className="arena-page__meta">{[person.location, person.experience, person.company].filter(Boolean).join(' · ')}</p>
        {paras(person.bio).map((paragraph, i) => <p key={i}>{withStudioMarkets(paragraph, { markets })}</p>)}
      </div>
    </div>
    {expertise.length > 0 && <><h3>Expertise</h3>
      <ul className="editorial-ledger editorial-ledger--expertise">{expertise.map(tag => <li className="editorial-ledger__row" key={tag} translate="no">{tag}</li>)}</ul>
    </>}
    {highlights.length > 0 && <><h3>Highlights</h3>
      <ol className="editorial-highlights">{highlights.map((item, i) => <li key={`${item}-${i}`}>
        <span className="editorial-ledger__number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><p>{item}</p>
      </li>)}</ol>
    </>}
    <div className="arena-page__actions">{socials.map(row => <a className="arena-page__action" key={row.label} href={safeHref(!row.href.startsWith('http') && row.href.includes('@') ? `mailto:${row.href}` : row.href)} target="_blank" rel="noopener noreferrer">{row.label}</a>)}</div>
  </EditorialChapter>;
}

export function TeamSection({ titleId, bodyOnly = false }: { readonly titleId: string; readonly bodyOnly?: boolean }) {
  const team = useSection('team', teamDefault as unknown as TeamData), s = useStudioStats();
  const all = (team.people ?? []).filter(p => p && (p.name || p.role || p.bio));
  const people = all.length > 0 ? all : teamDefault.people as unknown as Person[];
  const chapters = [...people.map((person, i) => ({ id: `team-person-${i + 1}`, label: person.name || `Profile ${i + 1}` })),
    { id: 'team-numbers', label: 'By the numbers' }, { id: 'team-culture', label: 'How we work' }, { id: 'team-join', label: 'Join the team' }];
  return <ArenaPageContent titleId={titleId} bodyOnly={bodyOnly} {...ARENA_PAGE_COPY.team}>
    <EditorialIndex chapters={chapters} />
    {people.map((person, i) => <Profile key={`${person.name}-${i}`} person={person} index={i} markets={s.markets} />)}
    <EditorialChapter id="team-numbers" number={String(people.length + 1).padStart(2, '0')} kicker="In production" title="By the numbers">
      <div className="editorial-stat-strip" role="group" aria-label="Team statistics">
        <EditorialCounter label="Years Exp" value={s.years} suffix="+" />
        <EditorialCounter label="Games Shipped" value={s.games} />
        <EditorialCounter label="Live Slots" value={s.slots} />
        <EditorialCounter label="Markets" value={s.markets} />
      </div>
    </EditorialChapter>
    <EditorialChapter id="team-culture" number={String(people.length + 2).padStart(2, '0')} kicker="Culture" title="How we work">
      <ul className="editorial-ledger">{(team.culture ?? []).filter(row => row && (row.tag || row.text)).map((row, i) => <li className="editorial-ledger__row" key={i}>
        {row.tag && <h3 className="arena-page__meta">{row.tag}</h3>}{row.text && <p className="editorial-statement">{row.text}</p>}
      </li>)}</ul>
    </EditorialChapter>
    <EditorialChapter id="team-join" number={String(people.length + 3).padStart(2, '0')} kicker="Next" title="Join the team">
      <p>We hire for craft, on a rolling basis. If you are exceptional at what you do and want your work in front of real players tonight, talk to us.</p>
      <div className="arena-page__actions"><button className="arena-page__action" type="button" onClick={openCareers}>See open roles</button></div>
    </EditorialChapter>
  </ArenaPageContent>;
}
