import { useSection } from '@/shared/content/SiteContentContext';
import partnerDefault from '@/api/partnerDefault.json';
import { PartnerPage } from './PartnerPage';
import { PartnerPending } from './PartnerPending';
import { usePartnerAuth } from './usePartnerAuth';
import './partner.css';

interface PartnerAreaProps {
  readonly titleId: string;
}

/** Loaded only for Client Area; the persistent arena shell stays mounted across auth changes. */
export function PartnerArea({ titleId }: PartnerAreaProps) {
  const content = useSection('partner', partnerDefault);
  const auth = usePartnerAuth();
  if (auth.status === 'unknown') return <PartnerPending titleId={titleId} />;
  return <PartnerPage content={content} titleId={titleId} auth={auth} />;
}
