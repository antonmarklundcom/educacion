/**
 * Entry points by área — the "no sé qué quiero estudiar todavía" path
 * (plan.md §3), one link per area hub.
 *
 * The options come from the `areas` facet of the same `searchPrograms()` call
 * the rest of the page uses, so the count under each area is the number of
 * published offerings behind that link and cannot disagree with the hub it
 * points at. Areas with nothing published are left out: an entry point to an
 * empty page is a dead end (design-system.md §8.4).
 *
 * These are navigation, not primary CTAs — no accent (design-system.md §2).
 */

import Link from 'next/link';

import { areaHref } from '@/components/browse';
import type { FacetOption } from '@/lib/search';

export function AreaGrid({ areas }: { areas: readonly FacetOption[] }) {
  const withSupply = areas.filter((area) => area.count > 0);
  if (withSupply.length === 0) return null;

  return (
    <section aria-labelledby="areas-heading">
      <h2 id="areas-heading" className="text-ink text-lg font-semibold lg:text-xl">
        Explorá por área
      </h2>
      <p className="text-muted mt-1 text-sm">
        Cada área abre su propia lista de carreras, con las universidades que las dictan.
      </p>

      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {withSupply.map((area) => (
          <li key={area.value}>
            <Link
              href={areaHref(area.value)}
              className="border-border bg-surface hover:bg-card-alt focus-visible:ring-ink flex min-h-14 items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="text-ink text-sm font-medium">{area.label}</span>
              <span className="text-muted shrink-0 text-xs">
                <span className="text-ink font-mono">{area.count}</span>{' '}
                {area.count === 1 ? 'oferta' : 'ofertas'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
