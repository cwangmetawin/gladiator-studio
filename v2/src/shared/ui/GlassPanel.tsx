import type { HTMLAttributes, ReactNode } from 'react';

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
  /** Lighter, borderless variant for nested surfaces. */
  readonly flat?: boolean;
  readonly className?: string;
}

/** Frosted-glass surface — the base material of every floating UI element. */
export function GlassPanel({ children, flat = false, className = '', ...rest }: GlassPanelProps) {
  const cls = `${flat ? 'glass glass--flat' : 'glass'} ${className}`.trim();
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
