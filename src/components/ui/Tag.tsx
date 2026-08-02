import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type TagProps = HTMLAttributes<HTMLSpanElement>;

/** Freeform, non-status label — e.g. an área or keyword. Never carries status colour. */
export function Tag({ className, children, ...props }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md bg-card-alt px-2 py-1 text-xs font-medium text-body',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
