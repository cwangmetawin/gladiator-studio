import { useMemo } from 'react';
import { useSection } from '@/shared/content/SiteContentContext';
import { useCatalogueGames, useStudioStats } from '@/shared/content/StudioStats';
import { GLADIATOR_SLOTS, METAWIN_ORIGINALS } from '@/api/gameData';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import partnerDefault from '@/api/partnerDefault.json';
import type { PartnerContent } from './partnerContent';
import { featuredCatalogue } from './partnerCatalogue';
import { PartnerPage } from './PartnerPage';
import { usePartnerCovers } from './usePartnerCovers';

interface PartnerAreaProps {
  readonly titleId: string;
}

const CURATED_GAMES = [...GLADIATOR_SLOTS, ...METAWIN_ORIGINALS];

/** The arena's editorial partner page; the homepage scene sleeps beneath this modal. */
export function PartnerArea({ titleId }: PartnerAreaProps) {
  const content = useSection('partner', partnerDefault as PartnerContent);
  const stats = useStudioStats(), games = useCatalogueGames(), phone = useIsMobile();
  const covers = usePartnerCovers();
  const catalogue = useMemo(() => featuredCatalogue(content.catalogue ?? [], games, CURATED_GAMES, covers.manifest, phone),
    [content.catalogue, games, covers.manifest, phone]);

  return <PartnerPage content={content} stats={stats} catalogue={catalogue} coversReady={covers.ready} titleId={titleId} />;
}
