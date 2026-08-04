/**
 * Sedes and turnos — every offering of this program at this institution.
 *
 * One program can be offered at several sedes and in several turnos, and each
 * of those carries its own arancel and its own convocatoria. Collapsing them
 * into "the program" would quietly hide a cheaper sede or an open
 * convocatoria, so they are listed.
 *
 * The map link is a Google Maps **search** for the sede's name and city, not a
 * pin: we do not store coordinates, and dropping a marker somewhere plausible
 * would be inventing a location for a real building.
 */

import { EnrollmentBadge, PriceLabel } from '@/components/browse';
import { Card } from '@/components/ui';
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
