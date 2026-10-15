import { ARENA_PAGE_COPY } from '@/features/arena-page/pageCopy';
import { ArenaPageContent } from '@/features/arena-page/ArenaPageContent';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
import { withCatalogueCounts } from '@/shared/utils/catalogueText';
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


const TITLE_ACRONYMS: Readonly<Record<string, string>> = {
  AI: 'AI',
  RNG: 'RNG',
  QA: 'QA',
  UI: 'UI',
  'PIXI.JS': 'Pixi.js',
};

/** Convert a SCREAMING title to Title Case while preserving known acronyms. */
function toTitleCase(raw: unknown): string {
  return String(raw ?? '')
    .split(' ')
    .map((word) => {
      const acronym = TITLE_ACRONYMS[word];
      if (acronym) return acronym;
      if (word === '/') return '/';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export function CareersSection({ titleId, bodyOnly = false }: { readonly titleId: string; readonly bodyOnly?: boolean }) {
  const s = useStudioStats();
  const careers = useSection('careers', careersDefault as { apply_email: string; positions: ContentPosition[] });
  const applyEmail = careers.apply_email || 'cwang@metawin.inc';
  const jobs = (careers.positions ?? []).filter(row => row && row.title);
  const cvHref = safeHref(`mailto:${applyEmail}?subject=${encodeURIComponent('Speculative Application — Gladiator Studio')}`);
  return <ArenaPageContent titleId={titleId} bodyOnly={bodyOnly} {...ARENA_PAGE_COPY.careers}>
    <section className="arena-page__section"><p className="arena-page__meta">{jobs.length} open roles · hiring on a rolling basis</p>
      <ol className="arena-page__rows">{jobs.map((job, i) => <li key={job.id || `pos-${i}`}>
        <span className="arena-page__number">{String(i + 1).padStart(2, '0')}</span><h2>{toTitleCase(job.title)}</h2>
        <p className="arena-page__meta">{job.department} · {job.location} · {job.type}</p><p>{withCatalogueCounts(job.summary, s)}</p>
        <details className="arena-page__details"><summary>Details</summary>
          <p>{withCatalogueCounts(job.description, s)}</p><h3>Requirements</h3>
          <ul className="arena-page__dots">{lines(job.requirements).map(item => <li key={item}>{item}</li>)}</ul>
          {lines(job.niceToHave).length > 0 && <><h3>Nice to Have</h3><ul className="arena-page__dots">{lines(job.niceToHave).map(item => <li key={item}>{item}</li>)}</ul></>}
        </details><a className="arena-page__action" href={safeHref(job.applyUrl)} target="_blank" rel="noopener noreferrer">Apply</a>
      </li>)}</ol>
    </section>
    <section className="arena-page__section"><h2>Role Not Listed?</h2><p>We hire senior talent across engineering, design, and product on a rolling basis. If you are exceptional at what you do and want to work on games that real players use daily, send us your dossier.</p>
      <a className="arena-page__action" href={cvHref}>Get in Touch</a>
    </section>
  </ArenaPageContent>;
}
