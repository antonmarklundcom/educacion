/**
 * `/universidades/[inst]/[program]` — the program detail page.
 *
 * The lead page of the whole site (seo.md §2). Everything on it is a server
 * component and everything it shows comes from `searchPrograms()` via
 * `findProgramOfferings()`; there is no client JavaScript on this route at all.
 *
 * **Provenance, or the honest gap.** Every fact carries where it came from
 * where the model has one: the arancel shows when it was verified and hides
 * itself past twelve months, the accreditation badge links to its source. Where
 * we have nothing — plan de estudio, título que otorga, fechas de convocatoria
 * — the page says "sin datos" and explains why, rather than leaving a blank
 * that reads as "none" (CLAUDE.md rule 1).
 *
 * `force-dynamic`, like the rest of Phase 1: CI builds without a database, and
 * `architecture.md` §3 already treats the ISR cache on Hostinger as an
 * optimization rather than an SEO property.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import {
  AccreditationBadge,
  EnrollmentBadge,
  InstitutionMonogram,
  VerifiedBadge,
  careerHref,
  institutionHref,
  priceDisplay,
} from '@/components/browse';
import { AccreditationBlock } from '@/components/program/AccreditationBlock';
import { AdmissionBlock } from '@/components/program/AdmissionBlock';
import { OfferingsBlock } from '@/components/program/OfferingsBlock';
import { PriceBlock } from '@/components/program/PriceBlock';
import { EventBeacon } from '@/components/analytics';
import { RelatedPrograms } from '@/components/program/RelatedPrograms';
import { LeadModal, WhatsAppButton } from '@/components/lead';
import { Badge } from '@/components/ui';
import { getInstitutionBySlug } from '@/lib/institutions';
import { getPlacementFlags } from '@/lib/entitlements';
import { formatDurationMonths } from '@/lib/format';
import { findProgramOfferings, findRelatedOfferings } from '@/lib/programs/lookup';
import {
  COMPARE_PARAM,
  LEVEL_LABELS,
  MANAGEMENT_LABELS,
  MODALITY_LABELS,
  VIEW_PARAM,
  type OfferingSummary,
} from '@/lib/search';

export const dynamic = 'force-dynamic';

type Params = Promise<{ instSlug: string; programSlug: string }>;

/** One lookup per request, shared by `generateMetadata` and the page body. */
const loadOfferings = cache(
  async (instSlug: string, programSlug: string): Promise<OfferingSummary[]> =>
    findProgramOfferings(instSlug, programSlug),
);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { instSlug, programSlug } = await params;
  const offerings = await loadOfferings(instSlug, programSlug);
  const primary = offerings[0];

  if (!primary) return { title: 'Carrera no encontrada' };

  const duration =
    primary.durationMonths != null ? formatDurationMonths(primary.durationMonths) : null;
  const price = priceDisplay(primary.price);
  const arancel = price.isGap ? 'consultá el arancel' : `${price.label}${price.unit ?? ''}`;

  return {
    title: `${primary.programName} – ${primary.institutionShort} | Arancel, duración y acreditación`,
    description: [
      `${primary.programName} en ${primary.institutionName}:`,
      duration ? `${duration},` : '',
      `modalidad ${MODALITY_LABELS[primary.modality].toLowerCase()},`,
      `${arancel} y estado de acreditación.`,
      'Compará con otras universidades del Paraguay.',
    ]
      .filter(Boolean)
      .join(' '),
    alternates: { canonical: `/universidades/${instSlug}/${programSlug}` },
    openGraph: {
      type: 'website',
      title: `${primary.programName} – ${primary.institutionShort}`,
      images: [
        {
          url: `/og/programa?inst=${instSlug}&program=${programSlug}`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${primary.programName} – ${primary.institutionShort}`,
      images: [`/og/programa?inst=${instSlug}&program=${programSlug}`],
    },
  };
}

export default async function ProgramPage({ params }: { params: Params }) {
  const { instSlug, programSlug } = await params;
  const offerings = await loadOfferings(instSlug, programSlug);
  const primary = offerings[0];

  if (!primary) notFound();

  const [related, institution, placements] = await Promise.all([
    findRelatedOfferings(primary),
    // The WhatsApp number lives on `institutions`, not on the index — one value
    // per institution against ~10k offerings, and a number corrected in the
    // admin has to be right now, not after the nightly rebuild
    // (architecture.md §6.2). This page already reads one institution, so the
    // cost is one query and the number is always current.
    getInstitutionBySlug(instSlug),
    // The badge is a claim about a commercial relationship *now*, so it is read
    // live rather than from `primary.planRank` (architecture.md §17).
    getPlacementFlags([primary.institutionId]),
  ]);
  const placement = placements.get(primary.institutionId);

  // Secondary since PR-14: it pre-selects this program in the comparador and
  // lands on the table view scoped to the same carrera. The primary slot now
  // belongs to the lead CTA, which is what the page is for.
  const compareHref = (() => {
    const query = new URLSearchParams();
    if (primary.careerSlug) query.set('carrera', primary.careerSlug);
    query.set(VIEW_PARAM, 'tabla');
    query.set(COMPARE_PARAM, String(primary.offeringId));
    return `/carreras?${query.toString()}`;
  })();

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-10">
      {/* Reported from the browser, not from this render: counting the view
          server-side would count every crawler as a student, and PR-28 shows
          this number to an institution (architecture.md §12). */}
      <EventBeacon
        key={primary.offeringId}
        type="offering_view"
        offeringId={primary.offeringId}
        institutionId={primary.institutionId}
      />
      <nav aria-label="Migas de pan" className="text-muted text-sm">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/universidades" className="hover:text-ink underline underline-offset-2">
              Universidades
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link
              href={institutionHref(primary.institutionSlug)}
              className="hover:text-ink underline underline-offset-2"
            >
              {primary.institutionShort}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-body">{primary.programName}</li>
        </ol>
      </nav>

      {/* Hero — the primary CTA sits above the fold at 390px */}
      <header className="mt-4 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <InstitutionMonogram
            institutionShort={primary.institutionShort}
            brandColor={primary.brandColor}
            size="lg"
          />
          <div className="min-w-0">
            <h1 className="text-ink text-xl leading-tight font-bold lg:text-2xl">
              {primary.programName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Link
                href={institutionHref(primary.institutionSlug)}
                className="text-body hover:text-ink text-sm underline underline-offset-2"
              >
                {primary.institutionName}
              </Link>
              {placement?.verified && <VerifiedBadge />}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AccreditationBadge accreditation={primary.accreditation} />
          <EnrollmentBadge status={primary.enrollmentStatus} />
          <Badge tone="neutral">{MANAGEMENT_LABELS[primary.management]}</Badge>
          <Badge tone="neutral">{LEVEL_LABELS[primary.level]}</Badge>
        </div>

        {/* The lead CTA is the primary slot and the only accent on the page
            (design-system.md §2). Comparar is a real action too, so it stays —
            as a secondary. WhatsApp renders only where the institution
            published a number. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <LeadModal
            offeringId={primary.offeringId}
            programName={primary.programName}
            institutionName={primary.institutionName}
          />
          <WhatsAppButton
            whatsappE164={institution?.whatsappE164}
            programName={primary.programName}
            institutionShort={primary.institutionShort}
            offeringId={primary.offeringId}
            institutionId={primary.institutionId}
          />
          <Link
            href={compareHref}
            className="border-border-strong bg-surface text-ink hover:bg-card-alt focus-visible:ring-ink inline-flex min-h-12 w-full items-center justify-center rounded-md border px-6 text-sm font-medium transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
          >
            Comparar con otras universidades
          </Link>
        </div>
      </header>

      <div className="mt-8 flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-6">
          <KeyFacts offering={primary} />
          <OfferingsBlock offerings={offerings} />
          <AccreditationBlock accreditation={primary.accreditation} />
          <RelatedPrograms offerings={related} careerName={primary.careerName} />
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-6">
          <PriceBlock price={primary.price} />
          <AdmissionBlock offering={primary} />
        </aside>
      </div>
    </main>
  );
}

/**
 * The key facts. `titleAwarded` and the plan de estudio are the two fields the
 * index carries no value for on most rows; both say so rather than vanishing,
 * because a missing "Título que otorga" is exactly the thing a student needs to
 * know we could not verify.
 */
function KeyFacts({ offering }: { offering: OfferingSummary }) {
  return (
    <section className="border-border bg-surface rounded-lg border p-6">
      <h2 className="text-ink text-base font-semibold">Datos de la carrera</h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <Fact term="Nivel" value={LEVEL_LABELS[offering.level]} />
        <Fact
          term="Duración"
          value={
            offering.durationMonths != null ? formatDurationMonths(offering.durationMonths) : null
          }
          numeric
        />
        <Fact term="Modalidad" value={MODALITY_LABELS[offering.modality]} />
        <Fact term="Gestión" value={MANAGEMENT_LABELS[offering.management]} />
        <Fact term="Título que otorga" value={offering.titleAwarded} />
        <Fact
          term="Carrera"
          value={offering.careerName}
          href={offering.careerSlug ? careerHref(offering.careerSlug) : undefined}
        />
        <Fact term="Plan de estudio" value={null} />
      </dl>
    </section>
  );
}

function Fact({
  term,
  value,
  href,
  numeric,
}: {
  term: string;
  value: string | null;
  href?: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <dt className="text-faint text-xs">{term}</dt>
      <dd className={value == null ? 'text-muted mt-0.5 text-sm' : 'text-ink mt-0.5 text-sm'}>
        {value == null ? (
          'Sin datos publicados'
        ) : href ? (
          <Link href={href} className="hover:text-body underline underline-offset-2">
            {value}
          </Link>
        ) : (
          <span className={numeric ? 'font-mono' : undefined}>{value}</span>
        )}
      </dd>
    </div>
  );
}
