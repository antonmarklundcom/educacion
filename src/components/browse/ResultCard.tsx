/**
 * One offering, in the exploration view (Dirección 1).
 *
 * Every field on the card comes from the `OfferingSummary` the index handed
 * us. Where the index has no value the card says so — "Duración sin datos" is
 * a worse-looking card and a truer one.
 *
 * Two deliberate omissions against the prototype, both because Phase 1 has not
 * built the thing behind them yet and a control that does nothing is worse
 * than no control (design-system.md §8.4):
 *
 *  - **"Solicitar info"** is the lead modal, which is PR-14. Until then the
 *    card's single primary CTA is the program page.
 *  - **The WhatsApp button** needs the institution's number, which is not on
 *    `OfferingSummary` and is not ours to guess. It arrives with PR-14.
 *
 * The favourites heart is Phase-1-optional per design-system.md §8.3 and is
 * not implemented here: it would be the only client state on the page.
 */

import Link from 'next/link';

import { Badge, Card } from '@/components/ui';
import { formatDurationMonths } from '@/lib/format';
import {
  LEVEL_LABELS,
  MANAGEMENT_LABELS,
  MODALITY_LABELS,
  type OfferingSummary,
} from '@/lib/search';

import { AccreditationBadge } from './AccreditationBadge';
import { EnrollmentBadge } from './EnrollmentBadge';
import { InstitutionMonogram } from './InstitutionMonogram';
import { PriceLabel } from './PriceLabel';
import { offeringHref } from './hrefs';

export function ResultCard({ offering }: { offering: OfferingSummary }) {
  const href = offeringHref(offering);

  return (
    <Card
      padded={false}
      className="p-5 transition-shadow duration-200 ease-out hover:shadow-[0_2px_12px_-4px_rgba(15,23,42,0.18)]"
    >
      <div className="flex items-start gap-3">
        <InstitutionMonogram
          institutionShort={offering.institutionShort}
          brandColor={offering.brandColor}
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-ink text-lg leading-snug font-semibold">
            <Link
              href={href}
              className="focus-visible:ring-ink rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {offering.programName}
            </Link>
          </h3>
          <p className="text-muted mt-0.5 text-sm">{offering.institutionShort}</p>
        </div>
        <EnrollmentBadge
          status={offering.enrollmentStatus}
          className="hidden shrink-0 sm:inline-flex"
        />
      </div>

      <dl className="text-body mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Fact term="Nivel" value={LEVEL_LABELS[offering.level]} />
        <Fact
          term="Duración"
          value={
            offering.durationMonths != null
              ? formatDurationMonths(offering.durationMonths)
              : 'Sin datos'
          }
          muted={offering.durationMonths == null}
        />
        <Fact term="Modalidad" value={MODALITY_LABELS[offering.modality]} />
        <Fact term="Ubicación" value={`${offering.cityName}, ${offering.departmentName}`} />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <AccreditationBadge accreditation={offering.accreditation} />
        <Badge tone="neutral">{MANAGEMENT_LABELS[offering.management]}</Badge>
        <EnrollmentBadge status={offering.enrollmentStatus} className="sm:hidden" />
      </div>

      <div className="border-border mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <PriceLabel price={offering.price} />
        <Link
          href={href}
          className="bg-accent hover:bg-accent-hover focus-visible:ring-ink inline-flex min-h-12 w-full items-center justify-center rounded-md px-5 text-sm font-medium text-white transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
        >
          Ver carrera
        </Link>
      </div>
    </Card>
  );
}

function Fact({ term, value, muted }: { term: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-faint text-xs">{term}</dt>
      <dd className={muted ? 'text-muted' : undefined}>{value}</dd>
    </div>
  );
}
