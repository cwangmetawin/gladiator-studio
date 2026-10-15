import { ARENA_PAGE_COPY } from '@/features/arena-page/pageCopy';
import { ArenaPageContent } from '@/features/arena-page/ArenaPageContent';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
import { withCatalogueCounts } from '@/shared/utils/catalogueText';
import journeyDefault from '@/api/journeyDefault.json';
import { groupJourneyChapters } from './chapters';

interface JourneyContent {
  readonly milestones: readonly { readonly date: string; readonly title: string; readonly description: string; readonly status: string }[];
}

export function JourneySection({ titleId, bodyOnly = false }: { readonly titleId: string; readonly bodyOnly?: boolean }) {
  const s = useStudioStats(), journey = useSection('journey', journeyDefault as JourneyContent);
  const chapters = groupJourneyChapters((journey.milestones ?? []).filter(row => row && row.title));
  return <ArenaPageContent titleId={titleId} bodyOnly={bodyOnly} {...ARENA_PAGE_COPY.journey} lede={withCatalogueCounts(ARENA_PAGE_COPY.journey.lede, s)}>
    {chapters.map(chapter => <section className="arena-page__section" key={chapter.index}>
      <p className="arena-page__meta">{String(chapter.index + 1).padStart(2, '0')} · {chapter.milestones[0]?.date} — {chapter.milestones.at(-1)?.date}</p>
      <h2>{chapter.label}</h2><ol className="arena-page__rows">{chapter.milestones.map((row, i) => <li key={`${row.date}-${i}`}>
        <p className="arena-page__meta"><time dateTime={row.date}>{row.date}</time> · {['COMPLETE', 'ACTIVE', 'QUEUED'].includes(row.status) ? row.status : 'QUEUED'}</p>
        <h3>{row.title.toLowerCase().replace(/\b\w/g, char => char.toUpperCase())}</h3><p>{row.description}</p>
      </li>)}</ol>
    </section>)}
  </ArenaPageContent>;
}
