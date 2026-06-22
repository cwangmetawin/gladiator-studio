interface DividerProps {
  /** Vertical hairline (default horizontal). */
  readonly vertical?: boolean;
  readonly className?: string;
}

/** A hairline divider — gradient-faded at the ends. */
export function Divider({ vertical = false, className = '' }: DividerProps) {
  return (
    <span
      aria-hidden="true"
      className={`${vertical ? 'hairline--v' : 'hairline'} ${className}`.trim()}
    />
  );
}
