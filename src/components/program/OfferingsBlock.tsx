/**
 * Sedes and turnos — every offering of this program at this institution.
 *
 * One program can be offered at several sedes and in several turnos, and each
 * of those carries its own arancel and its own convocatoria. Collapsing them
 * into "the program" would quietly hide a cheaper sede or an open
 * convocatoria, so they are listed.
 *
 * PR-48 added the per-sede total for the same reason: `pr-plan.md` asks for the
 * calculator "per option", and one aside figure for `offerings[0]` would state
 * the cost of an arbitrary sede as the cost of the carrera. Over five years two
 * sedes can differ by more than the annual arancel of either.
 *
 * The map link is a Google Maps **search** for the sede's name and city, not a
 * pin: we do not store coordinates, and dropping a marker somewhere plausible
 * would be inventing a location for a real building.
 */

import { EnrollmentBadge, PriceLabel } from '@/components/browse';
import { Card } from '@/components/ui';
import { copy } from '@/lib/copy';
import { compareCellLabel } from '@/lib/prices/total-cost-display';
import { totalCost } from '@/lib/prices/total-cost';
import { MODALITY_LABELS, SHIFT_LABELS, type OfferingSummary } from '@/lib/search';

function mapsHref(offering: OfferingSummary): string {
  const query = `${offering.campusName}, ${offering.cityName}, Paraguay`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function OfferingsBlock({ offerings }: { offerings: readonly OfferingSummary[] }) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-ink text-base font-semibold">
        {offerings.length === 1 ? 'Sede y turno' : `Sedes y turnos (${offerings.length})`}
      </h2>

      <ul className="flex flex-col gap-4">
        {offerings.map((offering) => (
          <li
            key={offering.offeringId}
            className="border-border flex flex-col gap-2 border-b pb-4 last:border-0 last:pb-0"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-ink text-sm font-semibold">{offering.campusName}</span>
              <PriceLabel price={offering.price} />
            </div>
            <p className="text-muted text-sm">
              {offering.cityName}, {offering.departmentName} · {MODALITY_LABELS[offering.modality]}{' '}
              · Turno {SHIFT_LABELS[offering.shift].toLowerCase()}
            </p>
            <p className="text-body text-sm">
              {copy.totalCost.compareLabel}:{' '}
              <span className="text-ink font-mono">
                {compareCellLabel(totalCost(offering.price, offering.durationMonths))}
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <EnrollmentBadge status={offering.enrollmentStatus} />
              <a
                href={mapsHref(offering)}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-body hover:text-ink focus-visible:ring-ink rounded-sm text-sm underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                Buscar la sede en el mapa ↗
              </a>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
