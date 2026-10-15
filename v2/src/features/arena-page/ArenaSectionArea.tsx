import { lazy, Suspense } from 'react';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { useStudioStats } from '@/shared/content/StudioStats';
import { withCatalogueCounts } from '@/shared/utils/catalogueText';
import type { Game } from '@/shared/types/game';
import type { FeederState } from '@/features/live-feed/useFeederSocket';
import { ArenaPageContent } from './ArenaPageContent';
import { ARENA_PAGE_COPY } from './pageCopy';
import type { ArenaPageId } from './useArenaPage';

const GamesPage = lazy(() => import('@/features/games/GamesPage').then(m => ({ default: m.GamesPage })));
const AboutSection = lazy(() => import('@/features/about/AboutSection').then(m => ({ default: m.AboutSection })));
const TeamSection = lazy(() => import('@/features/team/TeamSection').then(m => ({ default: m.TeamSection })));
const JourneySection = lazy(() => import('@/features/journey/JourneySection').then(m => ({ default: m.JourneySection })));
const LiveActivityFeed = lazy(() => import('@/features/live-feed/LiveActivityFeed').then(m => ({ default: m.LiveActivityFeed })));
const CareersSection = lazy(() => import('@/features/careers/CareersSection').then(m => ({ default: m.CareersSection })));
const ContactSection = lazy(() => import('@/features/contact/ContactSection').then(m => ({ default: m.ContactSection })));

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
  return <ArenaPageContent titleId={titleId} {...copy} lede={withCatalogueCounts(copy.lede, stats)}>
    <ErrorBoundary key={page} fallback={<p className="arena-page__section" role="status">Details could not be loaded. Please reload to try again.</p>}>
      <Suspense fallback={<p className="arena-page__section" role="status">Loading details…</p>}>
        {page === 'games' && <GamesPage titleId={titleId} bodyOnly games={games} loading={loading} focusGame={focusGame} onPlayGame={onPlayGame} />}
        {page === 'about' && <AboutSection titleId={titleId} bodyOnly />}
        {page === 'team' && <TeamSection titleId={titleId} bodyOnly />}
        {page === 'journey' && <JourneySection titleId={titleId} bodyOnly />}
        {page === 'live' && <LiveActivityFeed titleId={titleId} bodyOnly {...feed} />}
        {page === 'careers' && <CareersSection titleId={titleId} bodyOnly />}
        {page === 'contact' && <ContactSection titleId={titleId} bodyOnly />}
      </Suspense>
    </ErrorBoundary>
  </ArenaPageContent>;
}
