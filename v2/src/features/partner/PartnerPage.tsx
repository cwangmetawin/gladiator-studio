import type { SyntheticEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { StudioStats } from '@/shared/content/StudioStats';
import { FlatEmblem } from '@/features/arena/FlatEmblem';
import { withCatalogueCounts } from '@/shared/utils/catalogueText';
import { lines, safeHref } from '@/shared/utils/text';
import type { PartnerContent } from './partnerContent';
import type { PartnerTitle } from './partnerCatalogue';

interface PartnerPageProps {
  readonly content: PartnerContent;
  readonly stats: StudioStats;
  readonly catalogue: readonly PartnerTitle[];
  readonly coversReady: boolean;
  readonly titleId: string;
}

function AccessLink({ content }: { readonly content: PartnerContent }) {
  return content.ctaLabel && (
    <a className="partner__access" href={safeHref(content.ctaUrl)}>
      {content.ctaLabel}
      <ArrowUpRight size={16} aria-hidden="true" />
    </a>
  );
}

/** An absent original is a plain placeholder, never an error/retry loop. */
function coverError(event: SyntheticEvent<HTMLImageElement>, fallback: string): void {
  const image = event.currentTarget;
  if (fallback && image.dataset.fallback !== 'true') {
    image.dataset.fallback = 'true'; image.src = fallback;
  } else image.hidden = true;
}

export function PartnerPage({ content: c, stats: s, catalogue, coversReady, titleId }: PartnerPageProps) {
  const valueProps = (c.valueProps ?? []).filter(v => v && (v.title || v.body || v.tag));
  const steps = (c.steps ?? []).filter(step => step && (step.step || step.body));
  const specs = lines(c.specs), compliance = lines(c.compliancePoints);
  const faqs = (c.faqs ?? []).filter(faq => faq && (faq.q || faq.a));
  const email = String(c.contactEmail || '').trim();
  return (
    <main className="partner__stage">
      <section className="partner__hero">
        <div className="partner__identity">
          {c.eyebrow && <p className="partner__eyebrow">{c.eyebrow}</p>}
          <FlatEmblem className="partner__emblem" fillId={`${titleId}-steel`} />
        </div>
        <h1 id={titleId} className="partner__title" tabIndex={-1}>{c.title || 'Partners'}</h1>
        {c.lede && <p className="partner__lede">{c.lede}</p>}
        <div className="partner__hero-foot">
          <dl className="partner__stats" aria-label="Studio statistics">
            <div><dt>Games</dt><dd>{s.games}</dd></div>
            <div><dt>Max RTP</dt><dd>{Number(s.rtp.toFixed(1))}%</dd></div>
            <div><dt>Markets</dt><dd>{s.markets}</dd></div>
          </dl>
          <AccessLink content={c} />
        </div>
      </section>

      {valueProps.length > 0 && (
        <section className="partner__section" aria-label="Why partner with us">
          <div className="partner__values">
            {valueProps.map((value, i) => (
              <article key={i}>
                {value.tag && <p className="partner__eyebrow">{value.tag}</p>}
                {value.title && <h2>{value.title}</h2>}
                {value.body && <p>{withCatalogueCounts(value.body, s)}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      {steps.length > 0 && (
        <section className="partner__section" aria-labelledby={`${titleId}-steps`}>
          <h2 id={`${titleId}-steps`} className="partner__heading">Integration steps</h2>
          <ol className="partner__timeline">
            {steps.map((step, i) => (
              <li key={i}>
                <span className="partner__number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <div>{step.step && <h3>{step.step}</h3>}{step.body && <p>{step.body}</p>}</div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {specs.length > 0 && (
        <section className="partner__section" aria-labelledby={`${titleId}-specs`}>
          <h2 id={`${titleId}-specs`} className="partner__heading">What you get</h2>
          <ul className="partner__dots partner__specs">{specs.map((spec, i) => <li key={i}>{spec}</li>)}</ul>
        </section>
      )}

      {catalogue.length > 0 && (
        <section className="partner__section" aria-labelledby={`${titleId}-titles`}>
          <h2 id={`${titleId}-titles`} className="partner__heading">Featured titles</h2>
          <ul className="partner__titles">
            {catalogue.map((game, i) => (
              <li key={i}>
                <div className="partner__cover" aria-hidden="true">
                  {coversReady && game.cover?.url && (
                    <img key={game.cover.url} src={game.cover.url} alt="" width={game.cover.width} height={game.cover.height}
                      loading="lazy" decoding="async" data-fallback={game.cover.url === game.cover.fallbackUrl ? 'true' : undefined}
                      onError={event => coverError(event, game.cover?.fallbackUrl ?? '')} />
                  )}
                </div>
                <h3>{game.title}</h3>
                {game.genre && <p className="partner__genre">{game.genre}</p>}
                {game.rtp && <p className="partner__rtp">RTP {game.rtp}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(c.complianceTitle || c.complianceBody || compliance.length > 0) && (
        <section className="partner__section partner__compliance" aria-label="Compliance">
          <div>
            <p className="partner__eyebrow">Compliance</p>
            {c.complianceTitle && <h2 className="partner__heading">{c.complianceTitle}</h2>}
            {c.complianceBody && <p>{c.complianceBody}</p>}
          </div>
          {compliance.length > 0 && <ul className="partner__dots">{compliance.map((point, i) => <li key={i}>{point}</li>)}</ul>}
        </section>
      )}

      {faqs.length > 0 && (
        <section className="partner__section" aria-labelledby={`${titleId}-faq`}>
          <h2 id={`${titleId}-faq`} className="partner__heading">Partner FAQ</h2>
          <div className="partner__faq">
            {faqs.map((faq, i) => <article key={i}>{faq.q && <h3>{faq.q}</h3>}{faq.a && <p>{faq.a}</p>}</article>)}
          </div>
        </section>
      )}

      <section className="partner__section partner__closing">
        {c.closingTitle && <h2>{c.closingTitle}</h2>}
        {c.closingBody && <p>{c.closingBody}</p>}
        <div className="partner__closing-actions">
          <AccessLink content={c} />
          {email && <p className="partner__contact">Talk to us <a href={`mailto:${email}`}>{email}</a></p>}
        </div>
      </section>
      <footer className="partner__foot">© 2026 Gladiator Studio · A MetaWin Company</footer>
    </main>
  );
}
