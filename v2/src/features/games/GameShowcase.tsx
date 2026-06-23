import { useCallback, useMemo, useState } from 'react';
import { SectionWrapper } from '@/shared/components/SectionWrapper';
import { SectionHeading } from '@/shared/ui';
import type { Game } from '@/shared/types/game';
import { soundEngine } from '@/shared/utils/soundEngine';
import { GameCard, FeaturedCard } from './GameCard';

type FilterTab = 'slot' | 'mini' | 'new';

interface TabDefinition {
  readonly id: FilterTab;
  readonly label: string;
}

function getHotGames(slotGames: readonly Game[], miniGames: readonly Game[]): readonly Game[] {
  return [...slotGames, ...miniGames].filter((g) => g.isHot === true);
}

function buildTabLabel(id: FilterTab, slotCount: number, miniCount: number): string {
  if (id === 'slot') return `Slots (${slotCount})`;
  if (id === 'mini') return `Originals (${miniCount})`;
  return 'Hot';
}

// Purpose-designed wide hero art for the spotlight (falls back to the game cover
// until the asset is present).
const FEATURED_HERO = '/featured-hero.jpg';

const GRID_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
  gap: 16,
};

// ─── Filter tabs ────────────────────────────────────────────────────────────────

interface FilterTabsProps {
  readonly activeTab: FilterTab;
  readonly tabs: readonly TabDefinition[];
  readonly onTabChange: (tab: FilterTab) => void;
}

function FilterTabs({ activeTab, tabs, onTabChange }: FilterTabsProps) {
  return (
    <div className="tablist" role="tablist" aria-label="Game category filter">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab.id === activeTab}
          aria-controls={`games-panel-${tab.id}`}
          id={`games-tab-${tab.id}`}
          onClick={() => { soundEngine.click(); onTabChange(tab.id); }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      style={{
        aspectRatio: '3 / 4', borderRadius: 'var(--radius-md)', overflow: 'hidden', position: 'relative',
        background: 'linear-gradient(157deg, rgba(20,26,42,0.5), rgba(9,11,20,0.6))',
        border: '1px solid var(--color-line)',
      }}
    >
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, transparent 0%, rgba(79,195,247,0.06) 50%, transparent 100%)',
          backgroundSize: '220% 100%',
          animation: 'shimmer 1.6s var(--ease-in-out) infinite',
        }}
      />
    </div>
  );
}

const SKELETON_COUNT = 6;

interface GameGridProps {
  readonly games: readonly Game[];
  readonly loading: boolean;
  readonly activeTab: FilterTab;
  readonly onPlayGame: (game: Game) => void;
}

function GameGrid({ games, loading, activeTab, onPlayGame }: GameGridProps) {
  if (loading) {
    return (
      <div style={GRID_STYLE} aria-busy="true" aria-label="Loading games">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-text-dim)' }}>
          No titles in this category
        </p>
      </div>
    );
  }

  return (
    // Re-key by tab so switching categories replays the staggered card entrance.
    <div key={activeTab} id={`games-panel-${activeTab}`} role="tabpanel" aria-labelledby={`games-tab-${activeTab}`} style={GRID_STYLE}>
      {games.map((game, i) => <GameCard key={game.id} game={game} index={i} onPlayGame={onPlayGame} />)}
    </div>
  );
}

// ─── GameShowcase ─────────────────────────────────────────────────────────────────

interface GameShowcaseProps {
  readonly slotGames: readonly Game[];
  readonly miniGames: readonly Game[];
  readonly loading: boolean;
}

export function GameShowcase({ slotGames, miniGames, loading }: GameShowcaseProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('slot');
  const handlePlayGame = useCallback(() => {}, []);

  const hotGames = useMemo(() => getHotGames(slotGames, miniGames), [slotGames, miniGames]);

  const tabs = useMemo(
    (): readonly TabDefinition[] => [
      { id: 'slot', label: buildTabLabel('slot', slotGames.length, miniGames.length) },
      { id: 'mini', label: buildTabLabel('mini', slotGames.length, miniGames.length) },
      { id: 'new', label: buildTabLabel('new', slotGames.length, miniGames.length) },
    ],
    [slotGames.length, miniGames.length],
  );

  const currentGames = useMemo((): readonly Game[] => {
    switch (activeTab) {
      case 'slot': return slotGames;
      case 'mini': return miniGames;
      case 'new': return hotGames;
    }
  }, [activeTab, slotGames, miniGames, hotGames]);

  // The newest title (by release date) becomes the cinematic spotlight; the rest
  // fill the grid below, newest first.
  const featured = useMemo(
    () => (currentGames.length ? currentGames.reduce((a, b) => (b.timeline > a.timeline ? b : a)) : undefined),
    [currentGames],
  );
  const rest = useMemo(
    () => currentGames.filter((g) => g.id !== featured?.id).slice().sort((a, b) => b.timeline.localeCompare(a.timeline)),
    [currentGames, featured],
  );

  return (
    <SectionWrapper id="games">
      <SectionHeading
        as="h1"
        eyebrow="Catalogue"
        title="Game Catalogue"
        lede="Slots and MetaWin Originals — engineered to ULTRA volatility, certified fair, and built to perform in any lobby."
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <FilterTabs activeTab={activeTab} tabs={tabs} onTabChange={setActiveTab} />
        {!loading && (
          <p className="readout" aria-live="polite" aria-atomic="true">
            <span className="readout__value">{currentGames.length}</span>
            {currentGames.length === 1 ? 'title' : 'titles'}
          </p>
        )}
      </div>

      {loading ? (
        <GameGrid games={[]} loading activeTab={activeTab} onPlayGame={handlePlayGame} />
      ) : currentGames.length === 0 ? (
        <GameGrid games={[]} loading={false} activeTab={activeTab} onPlayGame={handlePlayGame} />
      ) : (
        <>
          {featured && <FeaturedCard key={featured.id} game={featured} heroImage={FEATURED_HERO} onPlayGame={handlePlayGame} />}
          {rest.length > 0 && <GameGrid games={rest} loading={false} activeTab={activeTab} onPlayGame={handlePlayGame} />}
        </>
      )}
    </SectionWrapper>
  );
}
