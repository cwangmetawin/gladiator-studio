import type { ReactNode } from 'react';
import { HeadlineWords } from './HeadlineWords';
import { FlatEmblem } from '@/features/arena/FlatEmblem';

interface ArenaPageContentProps {
  readonly titleId: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly children: ReactNode;
  readonly bodyOnly?: boolean;
  readonly headlineReady?: boolean;
}

/** The same hero sits over the live arena or the no-WebGL line drawing. */
export function ArenaPageContent({ titleId, eyebrow, title, lede, children, bodyOnly = false, headlineReady = true }: ArenaPageContentProps) {
  if (bodyOnly) return <>{children}</>;
  return <main className="partner__stage">
    <section className="partner__hero">
      <div className="partner__identity"><p className="partner__eyebrow">{eyebrow}</p><FlatEmblem className="partner__emblem" fillId={`${titleId}-steel`} /></div>
      <h1 id={titleId} className="partner__title" tabIndex={-1}><HeadlineWords text={title} ready={headlineReady} /></h1>
      <p className="partner__lede">{lede}</p>
    </section>
    {children}
  </main>;
}
