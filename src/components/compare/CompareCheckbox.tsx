'use client';

/**
 * CLIENT COMPONENT — one row's compare checkbox.
 *
 * Justification: it is a control whose state lives in the browser. It is a
 * leaf: it reads the provider's context and renders an input, so it adds no
 * data and no logic to the client bundle beyond the label it already displays.
 */

import { cn } from '@/lib/cn';
import type { CompareLabel } from '@/lib/compare/state';

import { useCompare } from './CompareProvider';

export interface CompareCheckboxProps {
  entry: CompareLabel;
  className?: string;
}

export function CompareCheckbox({ entry, className }: CompareCheckboxProps) {
  const { isSelected, toggle, isFull } = useCompare();
  const selected = isSelected(entry.id);

  return (
    <span
      className={cn('relative inline-flex size-5 shrink-0 items-center justify-center', className)}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => toggle(entry)}
        // Not `disabled` when the selection is full: the user must be able to
        // click it and be told why it did not take, rather than meet a control
        // that silently does nothing.
        aria-describedby={!selected && isFull ? 'comparador-limite' : undefined}
        aria-label={`Comparar ${entry.programName}`}
        className="peer checked:border-ink checked:bg-ink border-border-strong bg-surface focus-visible:ring-ink absolute inset-0 size-5 cursor-pointer appearance-none rounded border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      />
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none relative size-3 fill-none stroke-white opacity-0 peer-checked:opacity-100"
      >
        <path d="M3 8.5l3 3 7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
