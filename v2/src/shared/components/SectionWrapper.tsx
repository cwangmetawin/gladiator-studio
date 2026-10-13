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
        // Keep the section's flex column inside the wrapper: a wrapped Fragment's children
        // (e.g. the featured card, whose aspect-ratio height floor needs flex-item sizing)
        // must lay out exactly as they did as direct children of the section.
        return <Reveal className="flex flex-col gap-6">{child}</Reveal>;
      }) : children}
    </section>
  );
}
