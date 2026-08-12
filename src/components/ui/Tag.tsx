import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type TagProps = HTMLAttributes<HTMLSpanElement>;

/** Freeform, non-status label — e.g. an área or keyword. Never carries status colour. */
export function Tag({ className, children, ...props }: TagProps) {
  return (
    <span
      className={cn(
        'bg-card-alt text-body inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
