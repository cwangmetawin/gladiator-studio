import { lazy, Suspense } from 'react';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { useStudioStats } from '@/shared/content/StudioStats';
import { withStudioMarkets } from '@/shared/utils/studioText';
import { withCatalogueCounts } from '@/shared/utils/catalogueText';
import type { Game } from '@/shared/types/game';
import type { FeederState } from '@/features/live-feed/useFeederSocket';
import { ArenaPageContent } from './ArenaPageContent';
import { ARENA_PAGE_COPY } from './pageCopy';
import type { ArenaPageId } from './useArenaPage';
import { pageBodyLoaders } from './pageBodyLoaders';
import { usePageBodyReady } from './usePageBodyReady';

const GamesPage = lazy(pageBodyLoaders.games);
const AboutSection = lazy(pageBodyLoaders.about);
const TeamSection = lazy(pageBodyLoaders.team);
const JourneySection = lazy(pageBodyLoaders.journey);
const LiveActivityFeed = lazy(pageBodyLoaders.live);
const CareersSection = lazy(pageBodyLoaders.careers);
const ContactSection = lazy(pageBodyLoaders.contact);

interface ArenaSectionAreaProps {
  readonly page: ArenaPageId;
  readonly titleId: string;
  readonly games: readonly Game[];
  readonly loading: boolean;
  readonly focusGame: { readonly title: string; readonly request: number } | null;
  readonly onPlayGame: (game: { readonly title: string; readonly link: string }) => void;
  readonly feed: FeederState;
}

/** The hero never suspends or loses focus while the real section details load. */
export function ArenaSectionArea({ page, titleId, games, loading, focusGame, onPlayGame, feed }: ArenaSectionAreaProps) {
  const stats = useStudioStats(), copy = ARENA_PAGE_COPY[page];
  const bodyReady = usePageBodyReady(page);
  return <ArenaPageContent titleId={titleId} {...copy} headlineReady={bodyReady} lede={withStudioMarkets(withCatalogueCounts(copy.lede, stats), stats)}>
    {bodyReady ? <ErrorBoundary key={page} fallback={<p className="arena-page__section" role="status">Details could not be loaded. Please reload to try again.</p>}>
      <Suspense fallback={<p className="arena-page__section" role="status">Loading details…</p>}>
        {page === 'games' && <GamesPage titleId={titleId} bodyOnly games={games} loading={loading} focusGame={focusGame} onPlayGame={onPlayGame} />}
        {page === 'about' && <AboutSection titleId={titleId} bodyOnly />}
        {page === 'team' && <TeamSection titleId={titleId} bodyOnly />}
        {page === 'journey' && <JourneySection titleId={titleId} bodyOnly />}
        {page === 'live' && <LiveActivityFeed titleId={titleId} bodyOnly {...feed} />}
        {page === 'careers' && <CareersSection titleId={titleId} bodyOnly />}
        {page === 'contact' && <ContactSection titleId={titleId} bodyOnly />}
      </Suspense>
    </ErrorBoundary> : <p className="arena-page__section" role="status">Loading details…</p>}
  </ArenaPageContent>;
}
