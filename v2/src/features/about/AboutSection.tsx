import { ARENA_PAGE_COPY } from '@/features/arena-page/pageCopy';
import { ArenaPageContent } from '@/features/arena-page/ArenaPageContent';
import { EditorialChapter, EditorialCounter, EditorialIndex } from '@/features/arena-page/Editorial';
import { useSection } from '@/shared/content/SiteContentContext';
import { useCatalogueGames, useStudioStats } from '@/shared/content/StudioStats';
import { withCatalogueCounts } from '@/shared/utils/catalogueText';
import { lines } from '@/shared/utils/text';
import aboutDefault from '@/api/aboutDefault.json';

interface AboutContent {
  readonly tech: string | readonly string[];
  readonly features: readonly { readonly tag: string; readonly title: string; readonly body: string }[];
}

function openContact() {
  window.dispatchEvent(new CustomEvent('open-panel', { detail: 'contact' }));
}

const CHAPTERS = [
  { id: 'about-origin', label: 'Origin' },
  { id: 'about-craft', label: 'Craft' },
  { id: 'about-engine', label: 'Engine' },
  { id: 'about-partners', label: 'Partners' },
] as const;

export function AboutSection({ titleId, bodyOnly = false }: { readonly titleId: string; readonly bodyOnly?: boolean }) {
  const about = useSection('about', aboutDefault as AboutContent), s = useStudioStats();
  const hasRtp = useCatalogueGames().some(game => typeof game.rtp === 'number' && Number.isFinite(game.rtp) && game.rtp > 0);
  const features = (about.features ?? []).filter(row => row && (row.title || row.body || row.tag));
  return <ArenaPageContent titleId={titleId} bodyOnly={bodyOnly} {...ARENA_PAGE_COPY.about}>
    <EditorialIndex chapters={CHAPTERS} />
    <EditorialChapter id="about-origin" number="01" kicker="Origin" title="London-born. MetaWin-built.">
      <p>Gladiator Studio is <a href="https://metawin.com" target="_blank" rel="noopener noreferrer">MetaWin</a>’s in-house game studio. We make every title ourselves, from the first maths model to the last frame of the big-win sequence.</p>
    </EditorialChapter>
    <EditorialChapter id="about-craft" number="02" kicker="Craft" title="Volatility is a discipline.">
      <p>Every game is tuned for high-volatility play and every result is provably fair. We test the maths before we draw a single symbol.</p>
      <div className="editorial-stat-strip" role="group" aria-label="Studio statistics">
        <EditorialCounter label="Games" value={s.games} />
        {hasRtp ? <EditorialCounter label="Max RTP" value={s.rtp} decimals={1} suffix="%" />
          : <span className="editorial-counter" aria-label="Max RTP: Not provided"><span className="editorial-counter__value editorial-counter__unavailable" aria-hidden="true">Not provided</span><span className="editorial-counter__label" aria-hidden="true">Max RTP</span></span>}
        <EditorialCounter label="Markets" value={s.markets} />
      </div>
      <blockquote className="editorial-pullquote"><p>We don’t license other people’s games. We build every one of them.</p></blockquote>
    </EditorialChapter>
    <EditorialChapter id="about-engine" number="03" kicker="Engine" title="One pipeline, end to end.">
      <p>Game design, mathematics, WebGL rendering, back-end integration and live ops, owned by one team and shipped on infrastructure built for millions of concurrent sessions.</p>
      <h3>Tech Stack</h3>
      <ul className="editorial-tech-strip">{lines(about.tech).map(t => <li key={t} translate="no">{t}</li>)}</ul>
    </EditorialChapter>
    <EditorialChapter id="about-partners" number="04" kicker="Partners" title="Plug in once.">
      <p>{withCatalogueCounts('Operators and aggregators get {{games}} battle-tested titles, one API, real-time bet data and a team that answers.', s)}</p>
      <ol className="editorial-ledger editorial-feature-ledger">
        {features.map((row, i) => <li className="editorial-ledger__row" key={`${row.tag}-${i}`}>
          <span className="editorial-ledger__number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
          <div>{row.tag && <p className="arena-page__meta">{row.tag}</p>}{row.title && <h3>{row.title}</h3>}
            {row.body && <p>{withCatalogueCounts(row.body, s)}</p>}</div>
        </li>)}
      </ol>
      <div className="arena-page__actions">
        <a className="arena-page__action" href="https://metawin.com" target="_blank" rel="noopener noreferrer">Visit MetaWin <span className="arena-page__action-arrow" aria-hidden="true">↗</span></a>
        <a className="arena-page__action" href="mailto:cwang@metawin.inc?subject=Demo Request — Gladiator Studio">Request a demo <span className="arena-page__action-arrow" aria-hidden="true">↗</span></a>
        <button className="arena-page__action" type="button" onClick={openContact}>Partner with us</button>
      </div>
    </EditorialChapter>
  </ArenaPageContent>;
}
