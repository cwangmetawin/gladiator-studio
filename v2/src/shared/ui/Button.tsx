import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react';
import { soundEngine } from '@/shared/utils/soundEngine';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn btn--primary',
  secondary: 'btn',
  ghost: 'btn btn--ghost',
};

interface CommonProps {
  readonly variant?: Variant;
  readonly children: ReactNode;
  readonly className?: string;
}

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & { readonly href?: undefined };

type LinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className'> & { readonly href: string };

/**
 * Holo button with built-in click/hover sound feedback. Renders a semantic <a>
 * when `href` is supplied (navigation), otherwise a <button> (actions).
 */
export function Button(props: ButtonProps | LinkProps) {
  const { variant = 'secondary', className = '', children } = props;
  const cls = `${VARIANT_CLASS[variant]} ${className}`.trim();

  if ('href' in props && props.href !== undefined) {
    const { variant: _v, className: _c, children: _ch, onClick, onMouseEnter, ...rest } = props;
    return (
      <a
        {...rest}
        className={cls}
        onClick={(e) => { soundEngine.click(); onClick?.(e); }}
        onMouseEnter={(e) => { soundEngine.hover(); onMouseEnter?.(e); }}
      >
        {children}
      </a>
    );
  }

  const { variant: _v, className: _c, children: _ch, href: _h, onClick, onMouseEnter, type, ...rest } = props as ButtonProps;
  return (
    <button
      {...rest}
      type={type ?? 'button'}
      className={cls}
      onClick={(e) => { soundEngine.click(); onClick?.(e); }}
      onMouseEnter={(e) => { soundEngine.hover(); onMouseEnter?.(e); }}
    >
      {children}
    </button>
  );
}
