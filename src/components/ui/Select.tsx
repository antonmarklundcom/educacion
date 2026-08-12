import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function Select({ label, id, className, children, ...props }: SelectProps) {
  const select = (
    <div className="relative">
      <select
        id={id}
        className={cn(
          'border-border-strong bg-surface text-ink focus-visible:ring-ink min-h-12 w-full appearance-none rounded-md border px-4 pr-9 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="stroke-muted pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      >
        <path
          d="M5.5 7.5l4.5 4.5 4.5-4.5"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );

  if (!label) return select;

  return (
    <label htmlFor={id} className="text-body flex flex-col gap-1.5 text-sm">
      {label}
      {select}
    </label>
  );
}
