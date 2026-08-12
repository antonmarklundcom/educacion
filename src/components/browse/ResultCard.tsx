/**
 * One offering, in the exploration view (Dirección 1).
 *
 * Every field on the card comes from the `OfferingSummary` the index handed
 * us. Where the index has no value the card says so — "Duración sin datos" is
 * a worse-looking card and a truer one.
 *
 * ### The CTA row (settled in PR-14)
 *
 * Three controls, in the order design-system.md §7 and §8.2 ask for: the accent
 * primary is **"Solicitar info"**, because the lead is what the card is for;
 * "Ver carrera" drops to a secondary link; and the WhatsApp icon button sits
 * beside them as an outline, not as a peer of the accent.
 *
 * **The WhatsApp number is a prop, not a field on `OfferingSummary`.** It is
 * one value per institution and the index is one row per offering, so it is not
 * denormalized into `program_search` — the page fetches the numbers for the
 * institutions in its results in a single query and passes them down
 * (`architecture.md` §6.2). With no number the button is simply absent; nothing
 * is guessed.
 *
 * The favourites heart is Phase-1-optional per design-system.md §8.3 and is
 * not implemented here: it would be the only client state on the page.
 */

import Link from 'next/link';

import { LeadModal, WhatsAppButton } from '@/components/lead';
import { Badge, Card } from '@/components/ui';
import { formatDurationMonths } from '@/lib/format';
import {
  LEVEL_LABELS,
  MANAGEMENT_LABELS,
  MODALITY_LABELS,
  type OfferingSummary,
} from '@/lib/search';

import { AccreditationBadge } from './AccreditationBadge';
import { DestacadoBadge, VerifiedBadge, NO_PLACEMENT, type PlacementFlags } from './PlanBadges';
import { EnrollmentBadge } from './EnrollmentBadge';
import { InstitutionMonogram } from './InstitutionMonogram';
import { PriceLabel } from './PriceLabel';
import { offeringHref } from './hrefs';

export interface ResultCardProps {
  offering: OfferingSummary;
  /** The institution's published WhatsApp number, when it has one. */
  whatsappE164?: string | null;
  /**
   * The institution's plan marks, read live by the page (PR-27). Absent means
   * the free baseline — a card never infers a paid placement from
   * `offering.planRank`, which is a nightly-refreshed copy.
   */
  placement?: PlacementFlags;
}

export function ResultCard({ offering, whatsappE164, placement = NO_PLACEMENT }: ResultCardProps) {
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
          <p className="text-muted mt-0.5 flex flex-wrap items-center gap-2 text-sm">
            {offering.institutionShort}
            {placement.verified && <VerifiedBadge />}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {placement.destacado && <DestacadoBadge />}
          <EnrollmentBadge
            status={offering.enrollmentStatus}
            className="hidden shrink-0 sm:inline-flex"
          />
        </div>
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
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Link
            href={href}
            className="border-border-strong bg-surface text-ink hover:bg-card-alt focus-visible:ring-ink inline-flex min-h-12 flex-1 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:flex-none"
          >
            Ver carrera
          </Link>
          <LeadModal
            offeringId={offering.offeringId}
            programName={offering.programName}
            institutionName={offering.institutionName}
            className="flex-1 sm:flex-none"
          />
          <WhatsAppButton
            whatsappE164={whatsappE164}
            programName={offering.programName}
            institutionShort={offering.institutionShort}
            offeringId={offering.offeringId}
            institutionId={offering.institutionId}
            size="icon"
          />
        </div>
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
