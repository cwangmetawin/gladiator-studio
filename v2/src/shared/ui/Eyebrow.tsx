import type { ReactNode } from 'react';

interface EyebrowProps {
  readonly children: ReactNode;
  /** Show the pulsing holo dot at the start. */
  readonly dot?: boolean;
  readonly className?: string;
}

/** Small uppercase technical label — the section/area marker of the Starmap UI. */
export function Eyebrow({ children, dot = false, className = '' }: EyebrowProps) {
  return (
    <span className={`eyebrow ${className}`.trim()}>
      {dot && <span className="eyebrow__dot animate-electric-pulse" aria-hidden="true" />}
      {children}
    </span>
  );
}
