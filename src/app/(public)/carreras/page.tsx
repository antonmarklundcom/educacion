/**
 * `/carreras` — the browse view (Dirección 1).
 *
 * One route, one query, one piece of state: the URL. Everything on this page
 * is a server component except the mobile filter sheet, and nothing fetches
 * from the browser — the filter rail, the sort control and pagination are all
 * links back to this same route (architecture.md §3).
 *
 * `force-dynamic` rather than ISR: the page is a function of `searchParams`,
 * the unfiltered base case is cheap, and Hostinger's ISR cache is per-instance
 * and wiped on redeploy, so architecture.md §3 already treats it as an
 * optimization only. It also keeps the build free of a database, which is what
 * lets CI run `npm run build` without one.
 */

import type { Metadata } from 'next';

import {
  ActiveFilters,
  EmptyState,
  FilterRail,
  MobileFilterSheet,
  ResultCard,
  ResultTable,
  SearchBar,
  SortControl,
  ViewToggle,
} from '@/components/browse';
import { countActiveFilters } from '@/components/browse/filter-model';
import { CompareBar } from '@/components/compare/CompareBar';
import { CompareProvider } from '@/components/compare/CompareProvider';
import { compareLabel, parseCompareIds } from '@/lib/compare/state';
import { getWhatsappNumbers } from '@/lib/institutions';
import { Pagination } from '@/components/ui';
import {
  COMPARE_PARAM,
  DEFAULT_VIEW,
  VIEW_MODES,
  VIEW_PARAM,
  hasActiveFilters,
  parseSearchFilters,
  searchHref,
  searchPrograms,
  type ViewMode,
} from '@/lib/search';

export const dynamic = 'force-dynamic';

const BASE_PATH = '/carreras';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The unfiltered route is the indexable one. Every filter combination is
 * `noindex, follow` with a canonical back to the clean URL — otherwise the
 * facet grid becomes an unbounded set of near-duplicate crawlable pages
 * (seo.md §2).
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const filters = parseSearchFilters(await searchParams);
  const filtered = hasActiveFilters(filters);

  return {
    title: 'Carreras universitarias en Paraguay',
    description:
      'Buscá y compará carreras de grado, tecnicaturas y posgrados en Paraguay: nivel, modalidad, ciudad, arancel y estado de acreditación.',
    alternates: { canonical: BASE_PATH },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function CarrerasPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = parseSearchFilters(params);
  const { results, facets, total, page, pageSize, sort } = await searchPrograms(filters);

  // `vista` and `comparar` are not filters, but both have to survive every
  // facet toggle, every sort change and every page link.
  const view = readView(params[VIEW_PARAM]);
  const compareIds = parseCompareIds(params[COMPARE_PARAM]);
  const extra = {
    [VIEW_PARAM]: view === DEFAULT_VIEW ? undefined : view,
    [COMPARE_PARAM]: compareIds.length ? compareIds.join(',') : undefined,
  };

  // The card's WhatsApp CTA needs a number per institution, and the number is
  // not on `OfferingSummary` — it is one value per institution against ~10k
  // offerings, so denormalizing it into `program_search` would tie a phone
  // number's correctness to the nightly rebuild (architecture.md §6.2). One
  // query for the institutions on this page, keyed by ids the rows already
  // carry; never one query per row.
  const whatsappNumbers =
    view === 'tabla' || results.length === 0
      ? new Map<number, string>()
      : await getWhatsappNumbers(results.map((offering) => offering.institutionId));

  const totalPages = Math.ceil(total / pageSize);
  const activeCount = countActiveFilters(filters);

  return (
    <CompareProvider initialIds={compareIds} catalog={results.map(compareLabel)}>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:py-10">
        <header className="flex flex-col gap-4">
          <h1 className="text-ink text-xl font-bold lg:text-2xl">
            Carreras universitarias en Paraguay
          </h1>
          <SearchBar filters={filters} basePath={BASE_PATH} extra={extra} />
        </header>

        <div className="border-border mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-sm">
            Mostrando <strong className="text-ink font-semibold">{formatTotal(total)}</strong>
            {activeCount > 0 && (
              <span className="text-muted">
                {' · '}
                {activeCount} {activeCount === 1 ? 'filtro aplicado' : 'filtros aplicados'}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <MobileFilterSheet activeCount={activeCount}>
              <FilterRail
                filters={filters}
                facets={facets}
                basePath={BASE_PATH}
                extra={extra}
                compact
              />
            </MobileFilterSheet>
            <ViewToggle view={view} filters={filters} basePath={BASE_PATH} extra={extra} />
            <SortControl filters={filters} sort={sort} basePath={BASE_PATH} extra={extra} />
          </div>
        </div>

        {activeCount > 0 && (
          <div className="mt-4">
            <ActiveFilters filters={filters} basePath={BASE_PATH} extra={extra} />
          </div>
        )}

        <div className="mt-6 flex flex-col gap-8 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
          <aside className="border-border bg-card-alt hidden rounded-lg border p-5 lg:sticky lg:top-6 lg:block">
            <FilterRail filters={filters} facets={facets} basePath={BASE_PATH} extra={extra} />
          </aside>

          <div className="flex flex-col gap-4">
            {results.length === 0 ? (
              <EmptyState filters={filters} basePath={BASE_PATH} extra={extra} />
            ) : (
              <>
                {view === 'tabla' ? (
                  <ResultTable
                    results={results}
                    filters={filters}
                    sort={sort}
                    basePath={BASE_PATH}
                    extra={extra}
                  />
                ) : (
                  results.map((offering) => (
                    <ResultCard
                      key={offering.offeringId}
                      offering={offering}
                      whatsappE164={whatsappNumbers.get(offering.institutionId) ?? null}
                    />
                  ))
                )}
                <Pagination
                  className="mt-2 justify-center"
                  currentPage={page}
                  totalPages={totalPages}
                  buildHref={(target) => searchHref(BASE_PATH, { ...filters, page: target }, extra)}
                />
              </>
            )}
          </div>
        </div>

        {/* Room for the sticky compare bar so it never covers the last row. */}
        {compareIds.length > 0 && <div aria-hidden className="h-28" />}
        <CompareBar />
      </main>
    </CompareProvider>
  );
}

function readView(raw: string | string[] | undefined): ViewMode {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (VIEW_MODES as readonly string[]).includes(value ?? '')
    ? (value as ViewMode)
    : DEFAULT_VIEW;
}

function formatTotal(total: number): string {
  const count = new Intl.NumberFormat('es-PY').format(total);
  return `${count} ${total === 1 ? 'resultado' : 'resultados'}`;
}
