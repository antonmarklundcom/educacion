/**
 * The filter rail — a server component, and every control is a link.
 *
 * There is no client state here at all: a facet option is an `<a>` to the same
 * route with one value toggled in the query string, so filters survive reload
 * and the back button for free, work without JavaScript, and keep the browse
 * page inside the 150 kb budget (architecture.md §9). The checkbox look is
 * cosmetic; the semantics are navigation, which is what URL-driven filter state
 * actually is.
 *
 * The one exception is the arancel range, which is a plain GET form: a range
 * needs two numbers, and two numbers need a submit rather than 2·N links. The
 * prototype's slider is a client control by nature — the numeric range is the
 * JS-free equivalent and is exact rather than approximate.
 */

import { Fragment } from 'react';

import { cn } from '@/lib/cn';
import { formatGs } from '@/lib/format';
import {
  FILTER_PARAMS,
  clearFilters,
  searchHref,
  toggleFilterValue,
  type FacetOption,
  type Facets,
  type SearchFilters,
} from '@/lib/search';

import { FACET_GROUP_TITLES, RAIL_ORDER, countActiveFilters, filterKeyFor } from './filter-model';
import { HiddenFilters } from './HiddenFilters';

/** Extra query params (`vista`, `comparar`) that must survive every toggle. */
export type ExtraParams = Record<string, string | number | undefined | null>;

export interface FilterRailProps {
  filters: SearchFilters;
  facets: Facets;
  basePath: string;
  extra?: ExtraParams;
  /** Rendered inside the mobile sheet, where the heading is the sheet's own. */
  compact?: boolean;
  className?: string;
}

/** Cities are ~200 rows; the rail shows the useful ones and folds the rest. */
const CITIES_VISIBLE = 10;

export function FilterRail({
  filters,
  facets,
  basePath,
  extra,
  compact = false,
  className,
}: FilterRailProps) {
  const href = (next: SearchFilters) => searchHref(basePath, next, extra);
  const activeCount = countActiveFilters(filters);

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {!compact && (
        <div className="flex items-baseline justify-between">
          <h2 className="text-ink text-base font-semibold">Filtrar</h2>
          {activeCount > 0 && (
            <a
              href={href(clearFilters(filters))}
              className="text-body hover:text-ink focus-visible:ring-ink rounded-sm text-sm font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Limpiar ({activeCount})
            </a>
          )}
        </div>
      )}

      {RAIL_ORDER.map((groupKey) => {
        const filterKey = filterKeyFor(groupKey);
        const options = facets[groupKey];
        const visible = groupKey === 'cities' ? options.slice(0, CITIES_VISIBLE) : options;
        const folded = groupKey === 'cities' ? options.slice(CITIES_VISIBLE) : [];

        return (
          <Fragment key={groupKey}>
            {groupKey === 'cities' && (
              <ArancelSection filters={filters} href={href} basePath={basePath} extra={extra} />
            )}
            <Section title={FACET_GROUP_TITLES[groupKey]}>
              {options.length === 0 ? (
                <p className="text-muted text-sm">Sin opciones disponibles todavía.</p>
              ) : (
                <>
                  {visible.map((option) => (
                    <OptionLink
                      key={option.value}
                      option={option}
                      href={href(toggleFilterValue(filters, filterKey, option.value))}
                    />
                  ))}
                  {folded.length > 0 && (
                    <details className="mt-1">
                      <summary className="text-body hover:text-ink cursor-pointer list-none text-sm font-medium underline underline-offset-2">
                        Ver {folded.length} ciudades más
                      </summary>
                      <div className="mt-2 flex flex-col gap-2">
                        {folded.map((option) => (
                          <OptionLink
                            key={option.value}
                            option={option}
                            href={href(toggleFilterValue(filters, filterKey, option.value))}
                          />
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </Section>
          </Fragment>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-border flex flex-col gap-2 border-t pt-4 first:border-0 first:pt-0">
      <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

/**
 * A facet option. Selected state is ink, never the accent (design-system.md §2)
 * — the accent means "primary CTA" and nothing else on this page.
 */
function OptionLink({ option, href }: { option: FacetOption; href: string }) {
  return (
    <a
      href={href}
      aria-current={option.selected ? 'true' : undefined}
      className="group text-body focus-visible:ring-ink flex items-center gap-2.5 rounded-sm text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex size-5 shrink-0 items-center justify-center rounded border transition-colors duration-200 ease-out',
          option.selected
            ? 'border-ink bg-ink'
            : 'border-border-strong bg-surface group-hover:border-ink',
        )}
      >
        <svg
          viewBox="0 0 16 16"
          className={cn('size-3 fill-none stroke-white stroke-2', !option.selected && 'opacity-0')}
        >
          <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={cn('flex-1', option.selected && 'text-ink font-medium')}>
        {option.label}
      </span>
      <span className="text-faint font-mono text-xs">{option.count}</span>
    </a>
  );
}

/**
 * Arancel. The bounds are the *annual* cost, which is what the index sorts and
 * filters on — labelled as such rather than as the monthly figure the
 * prototype showed, because saying "mensual" over an annual bound would be a
 * wrong number dressed as a right one.
 */
function ArancelSection({
  filters,
  href,
  basePath,
  extra,
}: {
  filters: SearchFilters;
  href: (next: SearchFilters) => string;
  basePath: string;
  extra?: ExtraParams;
}) {
  const freeHref = href({
    ...filters,
    page: undefined,
    isFree: filters.isFree === true ? undefined : true,
  });

  return (
    <Section title="Arancel anual">
      <form method="get" action={basePath} className="flex flex-col gap-2">
        <HiddenFilters filters={filters} omit={['annualCostMin', 'annualCostMax']} extra={extra} />
        <div className="flex items-center gap-2">
          <label className="text-muted flex-1 text-xs">
            Desde
            <input
              type="number"
              name={FILTER_PARAMS.annualCostMin}
              min={0}
              step={100000}
              inputMode="numeric"
              defaultValue={filters.annualCostMin ?? ''}
              placeholder="0"
              className="border-border-strong bg-surface text-ink placeholder:text-faint focus-visible:ring-ink mt-1 min-h-10 w-full rounded-md border px-2.5 font-mono text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            />
          </label>
          <label className="text-muted flex-1 text-xs">
            Hasta
            <input
              type="number"
              name={FILTER_PARAMS.annualCostMax}
              min={0}
              step={100000}
              inputMode="numeric"
              defaultValue={filters.annualCostMax ?? ''}
              placeholder="Sin límite"
              className="border-border-strong bg-surface text-ink placeholder:text-faint focus-visible:ring-ink mt-1 min-h-10 w-full rounded-md border px-2.5 font-mono text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            />
          </label>
        </div>
        <p className="text-faint text-xs">
          En guaraníes por año. Solo se consideran aranceles verificados en los últimos 12 meses.
        </p>
        <button
          type="submit"
          className="border-border-strong bg-surface text-ink hover:bg-card-alt focus-visible:ring-ink min-h-10 self-start rounded-md border px-3 text-sm font-medium transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Aplicar arancel
        </button>
      </form>
      <a
        href={freeHref}
        aria-current={filters.isFree === true ? 'true' : undefined}
        className="group text-body focus-visible:ring-ink mt-1 flex items-center gap-2.5 rounded-sm text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span
          aria-hidden
          className={cn(
            'inline-flex size-5 shrink-0 items-center justify-center rounded border transition-colors duration-200 ease-out',
            filters.isFree === true
              ? 'border-ink bg-ink'
              : 'border-border-strong bg-surface group-hover:border-ink',
          )}
        >
          <svg
            viewBox="0 0 16 16"
            className={cn(
              'size-3 fill-none stroke-white stroke-2',
              filters.isFree !== true && 'opacity-0',
            )}
          >
            <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className={cn(filters.isFree === true && 'text-ink font-medium')}>
          Solo carreras gratuitas
        </span>
      </a>
      {(filters.annualCostMin != null || filters.annualCostMax != null) && (
        <p className="text-muted font-mono text-xs">
          {filters.annualCostMin != null ? formatGs(filters.annualCostMin) : 'Gs. 0'}
          {' – '}
          {filters.annualCostMax != null ? formatGs(filters.annualCostMax) : 'sin límite'}
        </p>
      )}
    </Section>
  );
}
