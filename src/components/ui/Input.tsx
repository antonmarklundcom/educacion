import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, id, className, ...props }: InputProps) {
  const input = (
    <input
      id={id}
      className={cn(
        'min-h-12 w-full rounded-md border border-border-strong bg-surface px-4 text-sm text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  );

  if (!label) return input;

  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-sm text-body">
      {label}
      {input}
    </label>
  );
}
