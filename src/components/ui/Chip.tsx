import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

/** Toggleable filter chip. Selected state uses ink, not the accent — see docs/design-system.md §2. */
export function Chip({ selected = false, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'focus-visible:ring-ink inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        selected
          ? 'border-ink bg-ink text-white'
          : 'border-border-strong bg-surface text-body hover:bg-card-alt',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
