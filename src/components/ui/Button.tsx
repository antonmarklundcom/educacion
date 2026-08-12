import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const base =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-5 text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:w-auto';

const variants = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'border border-border-strong bg-surface text-ink hover:bg-card-alt',
  ghost: 'text-ink hover:bg-card-alt',
} as const;

export type ButtonVariant = keyof typeof variants;

type CommonProps = {
  variant?: ButtonVariant;
  className?: string;
};

type ButtonAsButton = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type ButtonAsAnchor = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  const classes = cn(base, variants[variant], className);

  if ('href' in props && props.href !== undefined) {
    // `children` is destructured explicitly rather than spread: the anchor
    // form is a link and a link with no text is invisible to a screen reader,
    // so the a11y lint has to be able to see the content (PR-34).
    const { href, children, ...rest } = props;
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }

  const { type = 'button', ...rest } = props as ButtonAsButton;
  return <button type={type} className={classes} {...rest} />;
}
