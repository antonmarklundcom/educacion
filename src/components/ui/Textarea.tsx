import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

/** Same visual language as `Input` — multi-line fields (admin CRUD, PR-19) need it and Input can't grow. */
export function Textarea({ label, id, className, rows = 4, ...props }: TextareaProps) {
  const textarea = (
    <textarea
      id={id}
      rows={rows}
      className={cn(
        'border-border-strong bg-surface text-ink placeholder:text-faint focus-visible:ring-ink w-full rounded-md border px-4 py-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  );

  if (!label) return textarea;

  return (
    <label htmlFor={id} className="text-body flex flex-col gap-1.5 text-sm">
      {label}
      {textarea}
    </label>
  );
}
