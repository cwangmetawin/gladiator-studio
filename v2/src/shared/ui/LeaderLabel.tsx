interface LeaderLabelProps {
  readonly title: string;
  readonly meta?: string;
  /** Which side the connector extends toward (default 'right'). */
  readonly side?: 'left' | 'right';
  /** Connector length in px. */
  readonly length?: number;
  readonly className?: string;
}

/**
 * Star-Citizen-style callout: a glowing node, a thin connector that draws on,
 * and a title/meta block. Decorative — marked aria-hidden; the labelled element
 * carries its own accessible name.
 */
export function LeaderLabel({
  title,
  meta,
  side = 'right',
  length = 56,
  className = '',
}: LeaderLabelProps) {
  return (
    <span
      aria-hidden="true"
      className={`leader ${side === 'left' ? 'leader--left' : ''} ${className}`.trim()}
      style={{ ['--leader-len' as string]: `${length}px` }}
    >
      <span className="leader__node" />
      <span className="leader__line" />
      <span className="leader__body">
        <span className="leader__title">{title}</span>
        {meta && <span className="leader__meta">{meta}</span>}
      </span>
    </span>
  );
}
