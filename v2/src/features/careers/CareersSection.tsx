import { ARENA_PAGE_COPY } from '@/features/arena-page/pageCopy';
import { ArenaPageContent } from '@/features/arena-page/ArenaPageContent';
import { EditorialChapter, EditorialIndex } from '@/features/arena-page/Editorial';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
import { withCatalogueCounts } from '@/shared/utils/catalogueText';
import { withStudioMarkets } from '@/shared/utils/studioText';
import { lines, safeHref } from '@/shared/utils/text';
import careersDefault from '@/api/careersDefault.json';

interface ContentPosition {
  readonly id?: string;
  readonly title: string;
  readonly department: string;
  readonly location: string;
  readonly type: string;
  readonly summary: string;
  readonly description: string;
  readonly requirements: string | readonly string[];
  readonly niceToHave: string | readonly string[];
  readonly applyUrl: string;
}

export function CareersSection({ titleId, bodyOnly = false }: { readonly titleId: string; readonly bodyOnly?: boolean }) {
  const s = useStudioStats();
  const careers = useSection('careers', careersDefault as { apply_email: string; positions: ContentPosition[] });
  const applyEmail = careers.apply_email || 'cwang@metawin.inc';
  const jobs = (careers.positions ?? []).filter(row => row && row.title);
  const cvHref = safeHref(`mailto:${applyEmail}?subject=${encodeURIComponent('Speculative Application — Gladiator Studio')}`);
  return <ArenaPageContent titleId={titleId} bodyOnly={bodyOnly} {...ARENA_PAGE_COPY.careers}>
    {jobs.length === 0 ? <EditorialChapter id="careers-open-application" number="01" kicker="Careers" title="No open roles right now">
      <p className="editorial-deck">We are not advertising a role at the moment. We still want to hear from senior engineers, designers and game mathematicians: send your dossier and we will keep it on file for the next opening.</p>
      <div className="arena-page__actions"><a className="arena-page__action" href={cvHref}>Send your dossier <span className="arena-page__action-arrow" aria-hidden="true">↗</span></a></div>
    </EditorialChapter> : <>
    <EditorialIndex chapters={[{ id: 'careers-roles', label: 'Open roles' }, { id: 'careers-contact', label: 'Talk to us' }]} />
    <EditorialChapter id="careers-roles" number="01" kicker="Careers" title="Open roles">
      <p className="arena-page__meta">{jobs.length} open roles · hiring on a rolling basis</p>
      <ol className="arena-page__rows arena-page__positions">{jobs.map((job, i) => <li key={job.id || `pos-${i}`}>
        <details className="arena-page__details arena-page__position" name="open-roles">
          <summary>
            <span className="arena-page__number">{String(i + 1).padStart(2, '0')}</span>
            <span className="arena-page__position-heading"><span className="arena-page__position-title">{job.title}</span>
              <span className="arena-page__meta">{job.department} · {job.location} · {job.type}</span></span>
            <span className="arena-page__position-toggle" aria-hidden="true">+</span>
          </summary>
          <div className="arena-page__position-body">
            <p className="editorial-deck">{withStudioMarkets(withCatalogueCounts(job.summary, s), s)}</p>
            <p>{withStudioMarkets(withCatalogueCounts(job.description, s), s)}</p><h3>Requirements</h3>
            <ul className="arena-page__dots">{lines(job.requirements).map(item => <li key={item}>{item}</li>)}</ul>
            {lines(job.niceToHave).length > 0 && <><h3>Nice to Have</h3><ul className="arena-page__dots">{lines(job.niceToHave).map(item => <li key={item}>{item}</li>)}</ul></>}
            <a className="arena-page__action" href={safeHref(job.applyUrl)} target="_blank" rel="noopener noreferrer">Apply <span className="arena-page__action-arrow" aria-hidden="true">↗</span></a>
          </div>
        </details>
      </li>)}</ol>
    </EditorialChapter>
    <EditorialChapter id="careers-contact" number="02" kicker="Talk to us" title="Role Not Listed?">
      <p className="editorial-deck">We hire senior talent across engineering, design, and product on a rolling basis. If you are exceptional at what you do and want to work on games that real players use daily, send us your dossier.</p>
      <div className="arena-page__actions"><a className="arena-page__action" href={cvHref}>Get in Touch <span className="arena-page__action-arrow" aria-hidden="true">↗</span></a></div>
    </EditorialChapter>
    </>}
  </ArenaPageContent>;
}
