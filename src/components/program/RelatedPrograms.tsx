/**
 * The same carrera at a different institution — the highest-value internal
 * link on the page (seo.md §7).
 *
 * The list is never padded to reach a target count. Three related programs is
 * a nice-to-have; three *unrelated* ones would be filler that costs the user
 * attention and the site relevance.
 *
 * ### It is a placement surface, and now says so
 *
 * `findRelatedOfferings` asks `searchPrograms` for up to fifteen candidates
 * with the default sort and no query — the state in which every row ties on
 * relevance (`architecture.md` §4.1) — and takes three. So `plan_rank` alone
 * decides which three institutions get this link. The independent review of
 * PR-27 (PR-46) found it doing that with no badge and no disclosure, which is
 * the one thing `monetization.md` §3 says never to do. Both are here now.
 */

import Link from 'next/link';

import {
  DestacadoBadge,
  InstitutionMonogram,
  PlacementDisclosure,
  PriceLabel,
  offeringHref,
  type PlacementFlags,
} from '@/components/browse';
import { Card } from '@/components/ui';
import { formatDurationMonths } from '@/lib/format';
import type { OfferingSummary } from '@/lib/search';

export function RelatedPrograms({
  offerings,
  careerName,
  placements,
}: {
  offerings: readonly OfferingSummary[];
  careerName: string | null;
  /**
   * Live flags, keyed by institution id. **Required**, and deliberately not
   * optional: this list is ordered by `plan_rank`, so a caller that forgets the
   * prop gets a paid ordering with no badge and no disclosure — the exact
   * defect the PR-27 review found here. An empty map is the way to say "nothing
   * is placed", and it says it on purpose.
   */
  placements: ReadonlyMap<number, PlacementFlags>;
}) {
  if (offerings.length === 0) return null;

  const hasPaidPlacement = offerings.some(
    (offering) => placements.get(offering.institutionId)?.destacado,
  );

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
                <span className="text-muted flex min-w-0 items-center gap-1.5 text-xs">
                  <span className="truncate">
                    {offering.institutionShort} ·{' '}
                    {offering.durationMonths != null
                      ? formatDurationMonths(offering.durationMonths)
                      : 'duración sin datos'}
                  </span>
                  {placements.get(offering.institutionId)?.destacado && (
                    <DestacadoBadge className="shrink-0" />
                  )}
                </span>
              </span>
              <PriceLabel price={offering.price} className="shrink-0" />
            </Link>
          </li>
        ))}
      </ul>

      {hasPaidPlacement && <PlacementDisclosure />}
    </Card>
  );
}
