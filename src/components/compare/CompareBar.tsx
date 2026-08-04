'use client';

/**
 * CLIENT COMPONENT — the sticky compare bar.
 *
 * Justification: it renders the live selection, which only the browser knows
 * after the first click. It is fixed to the bottom above the safe area
 * (design-system.md §7) and is the only bottom-fixed affordance on a listing
 * page, which is why program detail pages get the sticky WhatsApp button and
 * listing pages do not.
 *
 * "Comparar N carreras" is a primary CTA, so it is one of the few places the
 * accent is allowed (design-system.md §2).
 */

import { InstitutionMonogram } from '@/components/browse/InstitutionMonogram';
import { compareCtaLabel, compareHref } from '@/lib/compare/state';
import { MAX_COMPARE } from '@/lib/search/contract';

import { useCompare } from './CompareProvider';

export function CompareBar() {
  const { entries, remove, clear, limitMessage } = useCompare();

  if (entries.length === 0 && !limitMessage) return null;

  return (
    <div className="border-border bg-surface fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(15,23,42,0.3)]">
      {limitMessage && (
        <p
          id="comparador-limite"
          role="status"
          className="bg-warn-bg text-warn px-4 py-2 text-center text-sm sm:px-6"
        >
          {limitMessage}
        </p>
      )}

      {entries.length > 0 && (
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="text-muted hidden shrink-0 text-sm sm:inline">
              Comparando {entries.length} de {MAX_COMPARE}
            </span>
            <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <span className="border-border bg-card-alt text-ink inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border py-1 pr-1 pl-1.5 text-sm">
                    {entry.institutionShort && (
                      <InstitutionMonogram
                        institutionShort={entry.institutionShort}
                        brandColor={entry.brandColor}
                        size="sm"
                      />
                    )}
                    <span className="truncate">{entry.programName}</span>
                    <button
                      type="button"
                      onClick={() => remove(entry.id)}
                      className="hover:bg-border focus-visible:ring-ink text-muted inline-flex size-6 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span aria-hidden>✕</span>
                      <span className="sr-only">Quitar {entry.programName} de la comparación</span>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={clear}
              className="focus-visible:ring-ink text-body hover:text-ink rounded-sm text-sm font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
            >
              Limpiar
            </button>
            <a
              href={compareHref(entries.map((entry) => entry.id))}
              className="bg-accent hover:bg-accent-hover focus-visible:ring-ink inline-flex min-h-12 w-full items-center justify-center rounded-md px-5 text-sm font-medium text-white transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
            >
              {compareCtaLabel(entries.length)} →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
