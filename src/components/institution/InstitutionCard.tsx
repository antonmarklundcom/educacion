/**
 * One institution in the directory.
 *
 * The only numbers on it are counts of what is published in the index — how
 * many programs, how many of them carry a current ANEAES accreditation, which
 * cities they are taught in. There are no ratings, no student numbers and no
 * "top 10" ordering, because we have none of those and inventing them is the
 * one thing this product cannot do (CLAUDE.md rule 1).
 */

import Link from 'next/link';

import { InstitutionMonogram, institutionHref } from '@/components/browse';
import { Badge, Card } from '@/components/ui';
import type { InstitutionSummary } from '@/lib/institutions';
import { INSTITUTION_TYPE_LABELS, MANAGEMENT_LABELS } from '@/lib/search';

const MAX_CITIES = 3;

export function InstitutionCard({ institution }: { institution: InstitutionSummary }) {
  const extraCities = institution.cityNames.length - MAX_CITIES;

  return (
    <Card padded={false} className="p-5">
      <div className="flex items-start gap-3">
        <InstitutionMonogram
          institutionShort={institution.nameShort}
          brandColor={institution.brandColor}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-ink text-base leading-snug font-semibold">
            <Link
              href={institutionHref(institution.slug)}
              className="focus-visible:ring-ink rounded-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              {institution.nameShort}
            </Link>
          </h2>
          <p className="text-muted mt-0.5 line-clamp-2 text-sm">{institution.nameOfficial}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{MANAGEMENT_LABELS[institution.management]}</Badge>
        <Badge tone="neutral">{INSTITUTION_TYPE_LABELS[institution.type]}</Badge>
        {institution.aneaesAccreditedCount > 0 && (
          <Badge tone="ok">
            {institution.aneaesAccreditedCount}{' '}
            {institution.aneaesAccreditedCount === 1
              ? 'carrera acreditada ANEAES'
              : 'carreras acreditadas ANEAES'}
          </Badge>
        )}
      </div>

      <dl className="border-border mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-faint text-xs">Carreras</dt>
          <dd className="text-ink font-mono">{institution.programCount}</dd>
        </div>
        {institution.cityNames.length > 0 && (
          <div className="flex min-w-0 items-baseline gap-1.5">
            <dt className="text-faint text-xs">Ciudades</dt>
            <dd className="text-body truncate">
              {institution.cityNames.slice(0, MAX_CITIES).join(', ')}
              {extraCities > 0 && ` +${extraCities}`}
            </dd>
          </div>
        )}
      </dl>

      {institution.programCount === 0 && (
        <p className="text-muted mt-3 text-sm">
          Todavía no cargamos las carreras de esta institución.
        </p>
      )}
    </Card>
  );
}
