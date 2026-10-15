import { HeadlineWords } from '@/features/arena-page/HeadlineWords';
import { useSection } from '@/shared/content/SiteContentContext';
import { FlatEmblem } from '@/features/arena/FlatEmblem';
import partnerDefault from '@/api/partnerDefault.json';

interface PartnerPendingProps {
  readonly titleId: string;
  readonly failed?: boolean;
}

/** Readable edited copy while the persistent dialog loads details or presents an error. */
export function PartnerPending({ titleId, failed = false }: PartnerPendingProps) {
  const content = useSection('partner', partnerDefault);
  return (
    <main className="partner__stage">
      <section className="partner__hero">
        <div className="partner__identity"><p className="partner__eyebrow">{content.eyebrow}</p><FlatEmblem className="partner__emblem" fillId={`${titleId}-steel`} /></div>
        <h1 id={titleId} className="partner__title" tabIndex={-1} aria-label={content.title || 'Partners'}><HeadlineWords text={content.title || 'Partners'} ready={false} /></h1>
        {content.lede && <p className="partner__lede">{content.lede}</p>}
        <p className="partner__load-status" role="status">{failed ? 'Partner details could not be loaded. Please reload the page to try again.' : 'Loading partner details…'}</p>
      </section>
    </main>
  );
}
