/**
 * The same carrera at a different institution — the highest-value internal
 * link on the page (seo.md §7).
 *
 * The list is never padded to reach a target count. Three related programs is
 * a nice-to-have; three *unrelated* ones would be filler that costs the user
 * attention and the site relevance.
 */

import Link from 'next/link';

import { InstitutionMonogram, PriceLabel, offeringHref } from '@/components/browse';
import { Card } from '@/components/ui';
import { formatDurationMonths } from '@/lib/format';
import type { OfferingSummary } from '@/lib/search';

export function RelatedPrograms({
  offerings,
  careerName,
}: {
  offerings: readonly OfferingSummary[];
  careerName: string | null;
}) {
  if (offerings.length === 0) return null;

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-ink text-base font-semibold">
        {careerName
          ? `${careerName} en otras instituciones`
          : 'Carreras relacionadas en otras instituciones'}
      </h2>

      <ul className="flex flex-col gap-3">
        {offerings.map((offering) => (
          <li key={offering.offeringId}>
            <Link
              href={offeringHref(offering)}
              className="border-border hover:bg-card-alt focus-visible:ring-ink flex items-center gap-3 rounded-md border p-3 transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none"
            >
              <InstitutionMonogram
                institutionShort={offering.institutionShort}
                brandColor={offering.brandColor}
                size="sm"
              />
              <span className="min-w-0 flex-1">
                <span className="text-ink block truncate text-sm font-medium">
                  {offering.programName}
                </span>
                <span className="text-muted block truncate text-xs">
                  {offering.institutionShort} ·{' '}
                  {offering.durationMonths != null
                    ? formatDurationMonths(offering.durationMonths)
                    : 'duración sin datos'}
                </span>
              </span>
              <PriceLabel price={offering.price} className="shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
