import { ARENA_PAGE_COPY } from '@/features/arena-page/pageCopy';
import { ArenaPageContent } from '@/features/arena-page/ArenaPageContent';
import { useSection } from '@/shared/content/SiteContentContext';
import { useStudioStats } from '@/shared/content/StudioStats';
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

export function AboutSection({ titleId, bodyOnly = false }: { readonly titleId: string; readonly bodyOnly?: boolean }) {
  const about = useSection('about', aboutDefault as AboutContent), s = useStudioStats();
  const features = (about.features ?? []).filter(row => row && (row.title || row.body || row.tag));
  return <ArenaPageContent titleId={titleId} bodyOnly={bodyOnly} {...ARENA_PAGE_COPY.about}>
    <section className="arena-page__section"><h2>Dossier</h2>
          <p style={{ marginBottom: 12 }}>
            Gladiator Studio is the in-house game development division of{' '}
            <a href="https://metawin.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-ice-200)', textDecoration: 'underline', textUnderlineOffset: 2 }}>MetaWin</a>,
            the world’s leading crypto casino. Founded in London, we design and build slot games from the ground up — combining high-volatility mechanics, provably fair mathematics, and cinematic production quality for a player base that expects nothing less.
          </p>
          <p style={{ marginBottom: 12 }}>
            Every title in our catalogue carries ULTRA volatility and RTPs above 96%, engineered for the crypto-native player who plays for life-changing hits. Our stack is built on WebGL, Babylon.js 3D, and TypeScript — running on AWS and GCP infrastructure capable of serving millions of concurrent sessions. We own the full production pipeline: game design, mathematics, front-end rendering, back-end integration, and live ops.
          </p>
          <p>
            {withCatalogueCounts('For operators and aggregators, integrating Gladiator Studio means accessing a battle-tested library of {{games}} titles backed by MetaWin platform infrastructure: seamless API integration, real-time bet data via our feeder system, and dedicated account support.', s)}
          </p>

    </section>
    <section className="arena-page__section" aria-label="Studio statistics"><dl className="arena-page__stats">
      <div><dt>Games</dt><dd>{s.games}</dd></div><div><dt>Max RTP</dt><dd>{Number(s.rtp.toFixed(1))}%</dd></div><div><dt>Markets</dt><dd>{s.markets}</dd></div>
    </dl></section>
    <section className="arena-page__section"><ol className="arena-page__rows">
      {features.map((row, i) => <li key={`${row.tag}-${i}`}><span className="arena-page__number">{String(i + 1).padStart(2, '0')}</span>
        {row.tag && <p className="arena-page__meta">{row.tag}</p>}{row.title && <h2>{row.title}</h2>}
        {row.body && <p>{withCatalogueCounts(row.body, s)}</p>}
      </li>)}
    </ol></section>
    <section className="arena-page__section"><h2>Tech Stack</h2><ul className="arena-page__dots">{lines(about.tech).map(t => <li key={t} translate="no">{t}</li>)}</ul></section>
    <section className="arena-page__section arena-page__actions">
      <a className="arena-page__action" href="https://metawin.com" target="_blank" rel="noopener noreferrer">Visit MetaWin</a>
      <a className="arena-page__action" href="mailto:cwang@metawin.inc?subject=Demo Request — Gladiator Studio">Request Demo</a>
      <button className="arena-page__action" type="button" onClick={openContact}>Partner With Us</button>
    </section>
  </ArenaPageContent>;
}
