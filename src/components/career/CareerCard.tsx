/**
 * One career in an area hub's grid. The only numbers on it are counts of what
 * is published in the index — same rule as `InstitutionCard` (CLAUDE.md rule 1).
 */

import Link from 'next/link';

import { careerHref } from '@/components/browse';
import { Card } from '@/components/ui';
import type { CareerWithStats } from '@/lib/careers';
import { LEVEL_LABELS } from '@/lib/search';

export function CareerCard({ career }: { career: CareerWithStats }) {
  const { stats } = career;

  return (
    <Card padded={false} className="p-5">
      <h3 className="text-ink text-base leading-snug font-semibold">
        <Link
          href={careerHref(career.slug)}
          className="focus-visible:ring-ink rounded-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {career.nameEs}
        </Link>
      </h3>
      <p className="text-muted mt-1 text-sm">{LEVEL_LABELS[career.levelDefault]}</p>

      {stats.offeringCount > 0 ? (
        <dl className="border-border mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-faint text-xs">Universidades</dt>
            <dd className="text-ink font-mono">{stats.institutionCount}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-faint text-xs">Ciudades</dt>
            <dd className="text-ink font-mono">{stats.cityCount}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-muted mt-3 text-sm">Todavía no cargamos ofertas de esta carrera.</p>
      )}
    </Card>
  );
}
