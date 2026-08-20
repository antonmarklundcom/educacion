/**
 * Sort, as a `<details>` disclosure of links.
 *
 * The prototype used a `<select>`, which needs JavaScript to navigate on
 * change. `<details>` is a native disclosure with keyboard support and no
 * script, and every option inside it is a real URL — so a sort choice is
 * shareable and survives the back button like every other piece of filter
 * state. Selected state is ink, never the accent (design-system.md §2).
 */

import { copy } from '@/lib/copy';
import { SORT_LABELS, SORT_KEYS, searchHref, type SearchFilters, type SortKey } from '@/lib/search';

import type { ExtraParams } from './FilterRail';

export interface SortControlProps {
  filters: SearchFilters;
  sort: SortKey;
  basePath: string;
  extra?: ExtraParams;
}

export function SortControl({ filters, sort, basePath, extra }: SortControlProps) {
  return (
    <details className="relative">
      <summary className="border-border-strong bg-surface text-ink focus-visible:ring-ink inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
        <span className="text-muted">{copy.browse.sortPrefix}</span>
        <span className="font-medium">{SORT_LABELS[sort]}</span>
        <svg aria-hidden viewBox="0 0 20 20" className="stroke-muted size-4 fill-none stroke-[1.5]">
          <path d="M5.5 7.5l4.5 4.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <ul className="border-border bg-surface absolute right-0 z-20 mt-1 w-64 rounded-md border py-1 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.35)]">
        {SORT_KEYS.map((key) => (
          <li key={key}>
            <a
              href={searchHref(basePath, { ...filters, sort: key, page: undefined }, extra)}
              aria-current={key === sort ? 'true' : undefined}
              className={
                key === sort
                  ? 'text-ink block px-3 py-2 text-sm font-medium'
                  : 'text-body hover:bg-card-alt block px-3 py-2 text-sm'
              }
            >
              {SORT_LABELS[key]}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
