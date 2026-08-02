import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/** Custom checkbox, CSS-driven via the peer state — no JS required. */
export function Checkbox({ label, className, id, ...props }: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn('inline-flex cursor-pointer items-center gap-2.5 text-sm text-body', className)}
    >
      <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          id={id}
          className="peer absolute inset-0 size-5 cursor-pointer appearance-none rounded border border-border-strong bg-surface checked:border-ink checked:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
          {...props}
        />
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="pointer-events-none relative size-3 fill-none stroke-white opacity-0 peer-checked:opacity-100"
        >
          <path
            d="M3 8.5l3 3 7-7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {label}
    </label>
  );
}
