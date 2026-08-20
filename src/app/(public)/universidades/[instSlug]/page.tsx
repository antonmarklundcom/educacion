/**
 * `/universidades/[slug]` — the institution profile.
 *
 * Two reads and no more: `getInstitutionBySlug()` for the profile and its
 * counts, and `searchPrograms({ institutionSlug })` for the program list. The
 * program list therefore inherits every filter, facet, sort and paging rule
 * from PR-07 — including the 12-month arancel rule — instead of reimplementing
 * a scoped version of them here. That is what "inline filters" means on this
 * page: the same `FilterRail`, pointed at this route, with counts already
 * scoped to this institution because `institutionSlug` is part of the query.
 *
 * A server component, no client JavaScript. No N+1: the counts come from one
 * grouped aggregate, the programs from one page query.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import {
  ActiveFilters,
  EmptyState,
  FilterRail,
  InstitutionMonogram,
  ResultCard,
  SortControl,
  countActiveFilters,
  FreshnessNote,
  VerifiedBadge,
} from '@/components/browse';
import { EventBeacon } from '@/components/analytics';
import { AccreditationSummary } from '@/components/institution/AccreditationSummary';
import { ClaimCta } from '@/components/institution/ClaimCta';
import { ContactBlock } from '@/components/institution/ContactBlock';
import { Badge, Pagination } from '@/components/ui';
import { getInstitutionBySlug } from '@/lib/institutions';
import { getPlacementFlags } from '@/lib/entitlements';
import { institutionSchema } from '@/lib/seo/catalog-schema';
import { JsonLd } from '@/lib/seo/jsonld';
import {
  INSTITUTION_TYPE_LABELS,
  MANAGEMENT_LABELS,
  parseSearchFilters,
  searchHref,
  searchPrograms,
} from '@/lib/search';

export const dynamic = 'force-dynamic';

type Params = Promise<{ instSlug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Shared by `generateMetadata` and the body — one profile read per request. */
const loadInstitution = cache(async (slug: string) => getInstitutionBySlug(slug));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { instSlug } = await params;
  const institution = await loadInstitution(instSlug);

  if (!institution) return { title: 'Institución no encontrada' };

  return {
    title: `${institution.nameShort} – Carreras, aranceles y sedes`,
    description: `${institution.nameOfficial}: ${institution.programCount} carreras publicadas, con duración, modalidad, arancel y estado de acreditación de cada una.`,
    alternates: { canonical: `/universidades/${instSlug}` },
  };
}

export default async function InstitutionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { instSlug } = await params;
  const institution = await loadInstitution(instSlug);

  if (!institution) notFound();

  const basePath = `/universidades/${instSlug}`;
  // The path already scopes to the institution, so `institucion=` never appears
  // in a link this page builds — it is added back only for the query.
  const railFilters = { ...parseSearchFilters(await searchParams), institutionSlug: undefined };
  const { results, facets, total, page, pageSize, sort } = await searchPrograms({
    ...railFilters,
    institutionSlug: instSlug,
  });

  const totalPages = Math.ceil(total / pageSize);
  const activeCount = countActiveFilters(railFilters);

  // One institution, so one lookup — and it is a live read, not
  // `program_search.plan_rank` (architecture.md §17).
  const placement = (await getPlacementFlags([institution.id])).get(institution.id);

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-10">
      <JsonLd data={institutionSchema(institution)} />
      {/* Browser-reported, for the same reason as the program page's. */}
      <EventBeacon key={institution.id} type="profile_view" institutionId={institution.id} />
      <header className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <InstitutionMonogram
            institutionShort={institution.nameShort}
            brandColor={institution.brandColor}
            size="lg"
          />
          <div className="min-w-0">
            <h1 className="text-ink text-xl leading-tight font-bold lg:text-2xl">
              {institution.nameOfficial}
            </h1>
            <p className="text-muted mt-1 flex flex-wrap items-center gap-2 text-sm">
              {institution.nameShort}
              {placement?.verified && <VerifiedBadge />}
            </p>
          </div>
        </div>

        {placement?.verified && (
          <p className="text-muted max-w-prose text-sm">
            Esta institución mantiene su perfil desde su propia cuenta: los datos que cargó los
            cargó ella. La acreditación y la habilitación siguen saliendo de la ANEAES y del CONES,
            con su fuente, y ningún plan las cambia.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{MANAGEMENT_LABELS[institution.management]}</Badge>
          <Badge tone="neutral">{INSTITUTION_TYPE_LABELS[institution.type]}</Badge>
          {institution.foundedYear && (
            <Badge tone="neutral">Fundada en {institution.foundedYear}</Badge>
          )}
        </div>

        {institution.descriptionMd && (
          <div className="text-body flex max-w-prose flex-col gap-2 text-sm">
            {institution.descriptionMd
              .split(/\n{2,}/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>
        )}

        {institution.cityNames.length > 0 && (
          <p className="text-body text-sm">
            <span className="text-faint text-xs">Ciudades: </span>
            {institution.cityNames.join(', ')}
          </p>
        )}
      </header>

      <div className="mt-8 flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <section className="flex flex-col gap-4">
          <div className="border-border flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-ink text-base font-semibold">
              Carreras{' '}
              <span className="text-muted font-mono text-sm">
                ({new Intl.NumberFormat('es-PY').format(total)})
              </span>
            </h2>
            <SortControl filters={railFilters} sort={sort} basePath={basePath} />
          </div>

          {activeCount > 0 && <ActiveFilters filters={railFilters} basePath={basePath} />}

          {results.length === 0 ? (
            <EmptyState filters={railFilters} basePath={basePath} />
          ) : (
            <>
              {results.map((offering) => (
                <ResultCard
                  key={offering.offeringId}
                  offering={offering}
                  // Every row here belongs to this one institution, so the
                  // one lookup above answers for all of them, they all share a
                  // `plan_rank`, and no placement has taken place.
                  // Passing the flags through printed "Destacado" — "ubicación
                  // paga, siempre etiquetada" — on a list nothing was paid to
                  // order, which the independent review of PR-27 (PR-46) called
                  // over-claiming, and it is: §17.1's rule cuts both ways. The
                  // `verified` half is a fact about the institution and stays,
                  // in the header where it belongs.
                  placement={placement ? { ...placement, destacado: false } : placement}
                  /* This page already loaded the profile, so the number is in
                     hand — no extra query, and no card here missing the CTA
                     its twin on /carreras has. */
                  whatsappE164={institution.whatsappE164}
                />
              ))}
              <FreshnessNote
                verifiedAt={
                  results
                    .map((offering) => offering.price.verifiedAt)
                    .filter((date): date is Date => date != null)
                    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
                }
                subject={`los aranceles de ${institution.nameShort}`}
              />
              <Pagination
                className="mt-2 justify-center"
                currentPage={page}
                totalPages={totalPages}
                buildHref={(target) => searchHref(basePath, { ...railFilters, page: target })}
              />
            </>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          <AccreditationSummary counts={institution} />
          <ContactBlock institution={institution} />
          <ClaimCta institutionSlug={instSlug} isClaimed={institution.isClaimed} />
          {total > 0 && (
            <div className="border-border bg-card-alt rounded-lg border p-5">
              <h2 className="text-ink text-base font-semibold">Filtrar carreras</h2>
              <div className="mt-4">
                <FilterRail filters={railFilters} facets={facets} basePath={basePath} compact />
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
