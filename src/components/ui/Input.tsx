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
        'border-border-strong bg-surface text-ink placeholder:text-faint focus-visible:ring-ink min-h-12 w-full rounded-md border px-4 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  );

  if (!label) return input;

  return (
    <label htmlFor={id} className="text-body flex flex-col gap-1.5 text-sm">
      {label}
      {input}
    </label>
  );
}
