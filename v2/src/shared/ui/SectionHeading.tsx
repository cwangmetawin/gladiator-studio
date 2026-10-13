import { useContext, type ReactNode } from 'react';
import { PanelMotionContext } from '@/shared/motion/panelMotion';
import { Reveal } from './Reveal';
import { PanelTitle } from './PanelTitle';
import { Eyebrow } from './Eyebrow';
import { DecodeText } from './DecodeText';

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
  const panel = useContext(PanelMotionContext);
  if (panel) {
    return (
      <div className={`flex flex-col gap-3 ${className}`.trim()}>
        {eyebrow && <Reveal stage="eyebrow" y={0}><Eyebrow dot>{eyebrow}</Eyebrow></Reveal>}
        <PanelTitle><Tag className="section-heading">{title}</Tag></PanelTitle>
        {lede && <Reveal stage="body" y={8}><p className="section-lede">{lede}</p></Reveal>}
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-3 ${className}`.trim()}>
      {eyebrow && <Eyebrow dot>{eyebrow}</Eyebrow>}
      <Tag className="section-heading">{typeof title === 'string' ? <DecodeText text={title} /> : title}</Tag>
      {lede && <p className="section-lede">{lede}</p>}
    </div>
  );
}
