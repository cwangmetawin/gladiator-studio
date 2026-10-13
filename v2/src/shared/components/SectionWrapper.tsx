import { Children, isValidElement, useContext, type CSSProperties, type ReactNode } from 'react';
import { PanelMotionContext } from '@/shared/motion/panelMotion';
import { SectionHeading } from '@/shared/ui/SectionHeading';
import { Reveal } from '@/shared/ui/Reveal';

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
  const panel = useContext(PanelMotionContext);
  return (
    <section id={id} className={`flex flex-col gap-6 ${className}`.trim()} style={style}>
      {panel ? Children.map(children, child => {
        if (child == null || typeof child === 'boolean') return child;
        if (isValidElement(child) && (child.type === SectionHeading || child.type === Reveal)) return child;
        return <Reveal>{child}</Reveal>;
      }) : children}
    </section>
  );
}
