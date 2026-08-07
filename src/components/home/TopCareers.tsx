/**
 * The careers with the most published offerings.
 *
 * The brief called this section "carreras más buscadas". It is not, and it
 * cannot be: we have no per-career search volume — `events` is counted by
 * type, by day and by institution, and at launch it is empty — so a
 * popularity heading would be a measurement we never took (CLAUDE.md rule 1).
 * What we do have is supply, which is a real fact about the index, so the
 * heading says "más opciones" and the line under it says exactly what the
 * order means. Nothing here is hedged: the numbers are counts of rows we
 * published.
 */

import Link from 'next/link';

import { careerHref } from '@/components/browse';
import type { CareerWithStats } from '@/lib/careers';
import { LEVEL_LABELS } from '@/lib/search';

export function TopCareers({ careers }: { careers: readonly CareerWithStats[] }) {
  if (careers.length === 0) return null;

  return (
    <section aria-labelledby="carreras-heading">
      <h2 id="carreras-heading" className="text-ink text-lg font-semibold lg:text-xl">
        Carreras con más opciones
      </h2>
      <p className="text-muted mt-1 max-w-prose text-sm">
        Ordenadas por la cantidad de ofertas que publicamos en cada carrera, no por popularidad: no
        medimos qué busca la gente.
      </p>

      <ul className="border-border bg-surface divide-border mt-5 divide-y rounded-lg border">
        {careers.map((career) => (
          <li key={career.id}>
            <Link
              href={careerHref(career.slug)}
              className="hover:bg-card-alt focus-visible:ring-ink flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none"
            >
              <span className="flex flex-col">
                <span className="text-ink text-sm font-medium">{career.nameEs}</span>
                <span className="text-faint text-xs">{LEVEL_LABELS[career.levelDefault]}</span>
              </span>
              <span className="text-muted text-xs">
                <span className="text-ink font-mono">{career.stats.offeringCount}</span>{' '}
                {career.stats.offeringCount === 1 ? 'oferta' : 'ofertas'} ·{' '}
                <span className="text-ink font-mono">{career.stats.institutionCount}</span>{' '}
                {career.stats.institutionCount === 1 ? 'institución' : 'instituciones'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
