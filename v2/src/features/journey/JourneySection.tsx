import { ARENA_PAGE_COPY } from '@/features/arena-page/pageCopy';
import { ArenaPageContent } from '@/features/arena-page/ArenaPageContent';
import { EditorialChapter, EditorialIndex, EditorialTimeline } from '@/features/arena-page/Editorial';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
import { withCatalogueCounts } from '@/shared/utils/catalogueText';
import { withStudioMarkets } from '@/shared/utils/studioText';
import journeyDefault from '@/api/journeyDefault.json';
import { groupJourneyChapters } from './chapters';

interface JourneyContent {
  readonly milestones: readonly { readonly date: string; readonly title: string; readonly description: string; readonly status: string }[];
}

export function JourneySection({ titleId, bodyOnly = false }: { readonly titleId: string; readonly bodyOnly?: boolean }) {
  const s = useStudioStats(), journey = useSection('journey', journeyDefault as JourneyContent);
  const chapters = groupJourneyChapters((journey.milestones ?? []).filter(row => row && row.title));
  const lede = withStudioMarkets(withCatalogueCounts(ARENA_PAGE_COPY.journey.lede, s), s);
  return <ArenaPageContent titleId={titleId} bodyOnly={bodyOnly} {...ARENA_PAGE_COPY.journey} lede={lede}>
    <EditorialIndex chapters={chapters.map(chapter => ({ id: `journey-${chapter.index + 1}`, label: chapter.label }))} />
    <EditorialTimeline>
      {chapters.map(chapter => <EditorialChapter id={`journey-${chapter.index + 1}`} key={chapter.index}
        number={String(chapter.index + 1).padStart(2, '0')} kicker={`${chapter.milestones[0]?.date} — ${chapter.milestones.at(-1)?.date}`} title={chapter.label}>
        <ol className="editorial-ledger editorial-timeline__milestones">{chapter.milestones.map((row, i) => <li className="editorial-ledger__row" key={`${row.date}-${i}`}>
          <div className="editorial-timeline__meta"><time className="editorial-timeline__date">{row.date}</time>
            <span className="editorial-status">{['COMPLETE', 'ACTIVE', 'QUEUED'].includes(row.status) ? row.status : 'QUEUED'}</span></div>
          <div><h3>{row.title}</h3><p>{withStudioMarkets(row.description, s)}</p></div>
        </li>)}</ol>
      </EditorialChapter>)}
    </EditorialTimeline>
  </ArenaPageContent>;
}
