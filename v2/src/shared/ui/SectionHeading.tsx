import type { ReactNode } from 'react';
import { Eyebrow } from './Eyebrow';

interface SectionHeadingProps {
  readonly eyebrow?: string;
  readonly title: ReactNode;
  readonly lede?: ReactNode;
  /** Heading level for correct document outline (default h2). */
  readonly as?: 'h1' | 'h2' | 'h3';
  readonly className?: string;
}

/** Eyebrow + display title + optional lede — the standard section opener. */
export function SectionHeading({
  eyebrow,
  title,
  lede,
  as: Tag = 'h2',
  className = '',
}: SectionHeadingProps) {
  return (
    <div className={`flex flex-col gap-3 ${className}`.trim()}>
      {eyebrow && <Eyebrow dot>{eyebrow}</Eyebrow>}
      <Tag className="section-heading">{title}</Tag>
      {lede && <p className="section-lede">{lede}</p>}
    </div>
  );
}
