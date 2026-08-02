import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const tones = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  info: 'bg-info-bg text-info',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-neutral-bg text-muted',
  accent: 'bg-accent-subtle text-ink',
} as const;

export type BadgeTone = keyof typeof tones;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}

/** Status-only colour usage — never decorative. See docs/design-system.md §4. */
export function Badge({ tone = 'neutral', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dotColor(tone))} />}
      {children}
    </span>
  );
}

function dotColor(tone: BadgeTone): string {
  switch (tone) {
    case 'ok':
      return 'bg-ok';
    case 'warn':
      return 'bg-warn';
    case 'info':
      return 'bg-info';
    case 'danger':
      return 'bg-danger';
    case 'accent':
      return 'bg-accent';
    default:
      return 'bg-muted';
  }
}
