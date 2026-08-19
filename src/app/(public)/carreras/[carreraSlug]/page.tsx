/**
 * `/carreras/[carreraSlug]` — the career hub, the primary SEO surface
 * (seo.md §1, "medicina en paraguay").
 *
 * Structurally this is `/universidades/[instSlug]` with the scope flipped:
 * one `searchPrograms({ careerSlugs: [slug] })` for the offering list (so the
 * 12-month arancel rule and the accreditation precedence rule are inherited,
 * never reimplemented), and two small reads from `@/lib/careers` for the
 * career record and its country-wide stats.
 *
 * `careerSlugs` is dropped from `railFilters` for the same reason
 * `institutionSlug` was on the institution page: it is what the *path* fixes,
 * not a filter this page's chips or facets should ever show as removable.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import {
  ActiveFilters,
  EmptyState,
  FilterRail,
  FreshnessNote,
  PlacementDisclosure,
  ResultCard,
  SortControl,
  areaHref,
  offeringHref,
  careerHref,
  countActiveFilters,
} from '@/components/browse';
import { Pagination } from '@/components/ui';
import {
  buildCareerIntro,
  getCareerBySlug,
  getCareerCitySupply,
  getCareerStats,
  hasEditorialCopy,
  listRelatedCareers,
  passesCityGate,
} from '@/lib/careers';
import { getWhatsappNumbers } from '@/lib/institutions';
import { getPlacementFlags } from '@/lib/entitlements';
import { hasSalidaLaboral } from '@/lib/careers/salida-laboral';
import type { PlacementFlags } from '@/components/browse';
import { DEFAULT_SORT, parseSearchFilters, searchHref, searchPrograms } from '@/lib/search';
import { itemListSchema } from '@/lib/seo/catalog-schema';
import { breadcrumbSchema, JsonLd } from '@/lib/seo/jsonld';

export const dynamic = 'force-dynamic';

type Params = Promise<{ carreraSlug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const loadCareer = cache(async (slug: string) => {
  const career = await getCareerBySlug(slug);
  if (!career) return null;
  const [stats, citySupply, related] = await Promise.all([
    getCareerStats(career.id),
    getCareerCitySupply(career.id),
    career.areaId ? listRelatedCareers(career.areaId, career.id, 6) : Promise.resolve([]),
  ]);
  return { career, stats, citySupply, related };
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { carreraSlug } = await params;
  const loaded = await loadCareer(carreraSlug);
  if (!loaded) return { title: 'Carrera no encontrada' };

  const { career, stats } = loaded;

  return {
    title: `${career.nameEs} en Paraguay – ${stats.institutionCount} universidades y aranceles`,
    description: `Compará ${stats.institutionCount || 'las'} opciones para estudiar ${career.nameEs} en Paraguay: aranceles, duración, modalidad y acreditación ANEAES.`,
    alternates: { canonical: careerHref(career.slug) },
    // A hub with no hand-written overview yet is thin by seo.md's own anti-doorway
    // standard, so it stays crawlable but out of the index until real copy lands
    // (docs/careers/copy.ts) — the page never fabricates the words to avoid this.
    robots: hasEditorialCopy(career.descriptionMd) ? undefined : { index: false, follow: true },
  };
}

export default async function CareraHubPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { carreraSlug } = await params;
  const loaded = await loadCareer(carreraSlug);
  if (!loaded) notFound();
  const { career, stats, citySupply, related } = loaded;

  const basePath = careerHref(career.slug);
  const railFilters = { ...parseSearchFilters(await searchParams), careerSlugs: undefined };
  const { results, facets, total, page, pageSize, sort } = await searchPrograms({
    ...railFilters,
    careerSlugs: [career.slug],
  });

  const totalPages = Math.ceil(total / pageSize);
  const activeCount = countActiveFilters(railFilters);
  const intro = buildCareerIntro(career, stats);

  const linkableCities = citySupply.filter(passesCityGate);

  const latestVerifiedAt = results
    .map((offering) => offering.price.verifiedAt)
    .filter((date): date is Date => date != null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const institutionIds = results.map((offering) => offering.institutionId);
  const [whatsappNumbers, placements] = await Promise.all([
    results.length === 0
      ? Promise.resolve(new Map<number, string>())
      : getWhatsappNumbers(institutionIds),
    results.length === 0
      ? Promise.resolve(new Map<number, PlacementFlags>())
      : getPlacementFlags(institutionIds),
  ]);
  const hasPaidPlacement = results.some(
    (offering) => placements.get(offering.institutionId)?.destacado,
  );

  // Schema follows the page's own `robots`: a hub below the editorial gate
  // renders `noindex`, and structured data on a page we are asking not to
  // index is at best ignored and at worst a thin-content signal (seo.md §5).
  const isIndexable = hasEditorialCopy(career.descriptionMd);
  // An `ItemList` describes *the* list at this URL. On a narrowed, reordered or
  // paginated view it would describe a slice — positions restarting at 1,
  // `numberOfItems` counting one page — while `alternates.canonical` points at
  // the bare hub, i.e. a different list. So the list ships only from the
  // canonical view, and never empty.
  //
  // `q` and `sort` are checked explicitly because `countActiveFilters` does not
  // count them: it feeds the "Filtrar (N)" badge, and `clearFilters` preserves
  // `q` deliberately. But a text search narrows this list and a re-sort
  // renumbers it, so either makes these positions describe something other than
  // the canonical page.
  const listsWholeHub =
    isIndexable &&
    page === 1 &&
    activeCount === 0 &&
    !railFilters.q &&
    sort === DEFAULT_SORT &&
    results.length > 0;
  const crumbs = [
    { name: 'Carreras', path: '/carreras' },
    ...(career.areaName && career.areaSlug
      ? [{ name: career.areaName, path: areaHref(career.areaSlug) }]
      : []),
    { name: career.nameEs, path: basePath },
  ];

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-10">
      {isIndexable && <JsonLd data={breadcrumbSchema(crumbs)} />}
      {listsWholeHub && (
        /* The programmes this page actually lists, in the order it lists them.
           Results are offerings, so one programme taught at two sedes appears
           twice with the same href — deduplicated here, because two ListItems
           with one URL at different positions is a contradiction. */
        <JsonLd
          data={itemListSchema(
            `${career.nameEs} en Paraguay`,
            [
              ...new Map(results.map((offering) => [offeringHref(offering), offering])).values(),
            ].map((offering) => ({
              name: `${offering.programName} – ${offering.institutionShort}`,
              path: offeringHref(offering),
            })),
          )}
        />
      )}
      <header className="flex flex-col gap-3">
        {career.areaName && career.areaSlug && (
          <Link
            href={areaHref(career.areaSlug)}
            className="text-muted hover:text-ink w-fit text-xs underline underline-offset-2"
          >
            {career.areaName}
          </Link>
        )}
        <h1 className="text-ink text-xl font-bold lg:text-2xl">{career.nameEs} en Paraguay</h1>

        <div className="flex flex-col gap-2">
          {intro.map((paragraph, index) => (
            <p key={index} className="text-body max-w-prose text-sm">
              {paragraph.text}
            </p>
          ))}
        </div>

        <FreshnessNote
          verifiedAt={latestVerifiedAt ?? null}
          subject={`los aranceles de ${career.nameEs}`}
        />
      </header>

      {linkableCities.length > 0 && (
        <section className="mt-6 flex flex-col gap-2">
          <h2 className="text-ink text-sm font-semibold">Estudiá {career.nameEs} en tu ciudad</h2>
          <div className="flex flex-wrap gap-2">
            {linkableCities.map((city) => (
              <Link
                key={city.citySlug}
                href={`${basePath}/${city.citySlug}`}
                className="border-border-strong bg-surface text-body hover:text-ink hover:border-ink rounded-full border px-3 py-1.5 text-sm"
              >
                {city.cityName}{' '}
                <span className="text-faint font-mono text-xs">({city.offeringCount})</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="border-border mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-ink text-base font-semibold">
          Universidades{' '}
          <span className="text-muted font-mono text-sm">
            ({new Intl.NumberFormat('es-PY').format(total)})
          </span>
        </h2>
        <SortControl filters={railFilters} sort={sort} basePath={basePath} />
      </div>

      {activeCount > 0 && (
        <div className="mt-4">
          <ActiveFilters filters={railFilters} basePath={basePath} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-8 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
        <aside className="border-border bg-card-alt rounded-lg border p-5 lg:sticky lg:top-6">
          <FilterRail filters={railFilters} facets={facets} basePath={basePath} compact />
        </aside>

        {hasSalidaLaboral(career.salidaLaboralMd) && (
          <section className="border-border bg-card-alt flex flex-col gap-2 rounded-md border p-5">
            <h2 className="text-ink text-base font-semibold">
              ¿Dónde se trabaja con {career.nameEs}?
            </h2>
            <p className="text-body max-w-prose text-sm leading-relaxed">
              Escribimos dónde trabaja la gente que estudia esta carrera, qué sectores contratan y
              cómo suele ser el primer trabajo. Sin sueldos promedio: no hay una fuente paraguaya
              que podamos citar.
            </p>
            <Link
              href={`/carreras/${career.slug}/empleos`}
              className="text-ink self-start text-sm font-medium underline underline-offset-4"
            >
              Ver la salida laboral de {career.nameEs}
            </Link>
          </section>
        )}

        <div className="flex flex-col gap-4">
          {results.length === 0 ? (
            <EmptyState filters={railFilters} basePath={basePath} />
          ) : (
            <>
              {results.map((offering) => (
                <ResultCard
                  key={offering.offeringId}
                  offering={offering}
                  whatsappE164={whatsappNumbers.get(offering.institutionId) ?? null}
                  placement={placements.get(offering.institutionId)}
                />
              ))}
              {hasPaidPlacement && <PlacementDisclosure className="text-faint mt-1 text-xs" />}
              <Pagination
                className="mt-2 justify-center"
                currentPage={page}
                totalPages={totalPages}
                buildHref={(target) => searchHref(basePath, { ...railFilters, page: target })}
              />
            </>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="border-border mt-10 flex flex-col gap-3 border-t pt-6">
          <h2 className="text-ink text-base font-semibold">Otras carreras del área</h2>
          <div className="flex flex-wrap gap-2">
            {related.map((relatedCareer) => (
              <Link
                key={relatedCareer.slug}
                href={careerHref(relatedCareer.slug)}
                className="border-border-strong bg-surface text-body hover:text-ink hover:border-ink rounded-full border px-3 py-1.5 text-sm"
              >
                {relatedCareer.nameEs}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
