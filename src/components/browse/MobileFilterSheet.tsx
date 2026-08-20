'use client';

/**
 * CLIENT COMPONENT — the only one on `/carreras`.
 *
 * Justification: a bottom sheet is open/closed state plus Escape-to-close and
 * a scroll lock, none of which exist without JavaScript. The filter rail
 * itself stays a server component and is passed in as `children`, so what
 * ships to the browser is this shell and nothing else — no facet data, no
 * filter logic, no search code.
 *
 * design-system.md §7: filters live in a bottom sheet behind a `Filtrar (N)`
 * chip on mobile, never a collapsed sidebar.
 */

import { useEffect, useId, useRef, useState } from 'react';

import { filterSheetCopy } from '@/lib/copy/filter-sheet';

export interface MobileFilterSheetProps {
  activeCount: number;
  children: React.ReactNode;
}

export function MobileFilterSheet({ activeCount, children }: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={panelId}
        className="border-border-strong bg-surface text-ink hover:bg-card-alt focus-visible:ring-ink inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-2">
          <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
        </svg>
        {activeCount > 0 ? filterSheetCopy.triggerWithCount(activeCount) : filterSheetCopy.trigger}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            aria-label={filterSheetCopy.closeBackdrop}
            onClick={() => setOpen(false)}
            className="bg-ink/40 absolute inset-0"
          />
          <div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label={filterSheetCopy.dialogLabel}
            className="bg-surface relative max-h-[85vh] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
          >
            <div className="border-border bg-surface sticky top-0 flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-ink text-base font-semibold">{filterSheetCopy.heading}</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="text-body hover:bg-card-alt focus-visible:ring-ink inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <span aria-hidden>✕</span>
                <span className="sr-only">{filterSheetCopy.close}</span>
              </button>
            </div>
            <div className="px-5 py-5">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}
