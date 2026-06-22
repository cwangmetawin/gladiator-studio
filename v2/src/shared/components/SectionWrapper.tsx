import type { CSSProperties, ReactNode } from 'react';

interface SectionWrapperProps {
  readonly id: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/**
 * Layout wrapper for a content section rendered inside the sliding panel.
 * The panel already applies its own padding, so this stays edge-to-edge and
 * simply provides vertical rhythm between a section's blocks.
 */
export function SectionWrapper({ id, children, className = '', style }: SectionWrapperProps) {
  return (
    <section id={id} className={`flex flex-col gap-6 ${className}`.trim()} style={style}>
      {children}
    </section>
  );
}
