/**
 * The decision view (Dirección 4): dense, sortable, multi-selectable.
 *
 * A server component. The only client thing in a row is the compare checkbox,
 * which is a leaf; the row itself, its links and its sort headers are HTML.
 *
 * Two things the prototype did that this does not (design-system.md §8.1):
 * sortable headers are **ink**, not accent blue — the accent means "primary
 * CTA" — and the per-row "Solicitar" button is gone until PR-14 gives it
 * something to do.
 *
 * On mobile this is not a horizontally scrolling table (§7). It is the D4
 * compact card: header row plus a 2×2 grid of Gestión / Duración / Arancel /
 * Acreditación.
 */

import Link from 'next/link';

import { CompareCheckbox } from '@/components/compare/CompareCheckbox';
import { compareLabel } from '@/lib/compare/state';
import { cn } from '@/lib/cn';
import { formatDurationMonths } from '@/lib/format';
import {
  MANAGEMENT_LABELS,
  MODALITY_LABELS,
  searchHref,
  type OfferingSummary,
  type SearchFilters,
  type SortKey,
} from '@/lib/search';

import { AccreditationBadge } from './AccreditationBadge';
import { InstitutionMonogram } from './InstitutionMonogram';
import { DestacadoBadge, NO_PLACEMENT, VerifiedBadge, type PlacementFlags } from './PlanBadges';
import { PriceLabel } from './PriceLabel';
import type { ExtraParams } from './FilterRail';
import { offeringHref } from './hrefs';

/** Desktop grid: checkbox · carrera/institución · gestión · modalidad · duración · arancel · acreditación. */
const GRID =
  'grid grid-cols-[2rem_minmax(0,2.4fr)_6rem_8rem_7rem_9rem_minmax(0,1fr)] items-center gap-3';

export interface ResultTableProps {
  results: readonly OfferingSummary[];
  filters: SearchFilters;
  sort: SortKey;
  basePath: string;
  extra?: ExtraParams;
  /**
   * Plan marks per institution id, read live by the page (PR-27). The dense
   * view labels a paid placement exactly like the card view does — the
   * disclosure cannot depend on which view the student happens to be in.
   */
  placements?: ReadonlyMap<number, PlacementFlags>;
}

export function ResultTable({
  results,
  filters,
  sort,
  basePath,
  extra,
  placements,
}: ResultTableProps) {
  const sortHref = (key: SortKey) =>
    searchHref(basePath, { ...filters, sort: key, page: undefined }, extra);

  return (
    <div className="border-border bg-surface overflow-hidden rounded-lg border">
      <div
        className={cn(GRID, 'border-border bg-card-alt hidden border-b px-4 py-2.5 lg:grid')}
        role="row"
      >
        <span aria-hidden />
        <SortHeader
          label="Carrera / Institución"
          keys={['nombre_asc', 'institucion_asc']}
          sort={sort}
          sortHref={sortHref}
        />
        <ColumnHeader>Gestión</ColumnHeader>
        <ColumnHeader>Modalidad</ColumnHeader>
        <SortHeader
          label="Duración"
          keys={['duracion_asc', 'duracion_desc']}
          sort={sort}
          sortHref={sortHref}
        />
        <SortHeader
          label="Arancel"
          keys={['arancel_asc', 'arancel_desc']}
          sort={sort}
          sortHref={sortHref}
        />
        <ColumnHeader>Acreditación</ColumnHeader>
      </div>

      <ul className="divide-border divide-y">
        {results.map((offering, index) => (
          <li
            key={offering.offeringId}
            className={cn(
              'transition-transform duration-200 ease-out lg:hover:scale-[1.01]',
              index % 2 === 1 && 'bg-card-alt/60',
            )}
          >
            <Row
              offering={offering}
              placement={placements?.get(offering.institutionId) ?? NO_PLACEMENT}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({
  offering,
  placement = NO_PLACEMENT,
}: {
  offering: OfferingSummary;
  placement?: PlacementFlags;
}) {
  const href = offeringHref(offering);
  const duration =
    offering.durationMonths != null ? formatDurationMonths(offering.durationMonths) : 'Sin datos';

  return (
    <>
      {/* Desktop */}
      <div className={cn(GRID, 'hidden px-4 py-3 lg:grid')}>
        <CompareCheckbox entry={compareLabel(offering)} />
        <div className="flex min-w-0 items-center gap-2.5">
          <InstitutionMonogram
            institutionShort={offering.institutionShort}
            brandColor={offering.brandColor}
            size="sm"
          />
          <div className="min-w-0">
            <Link
              href={href}
              className="focus-visible:ring-ink text-ink block truncate text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              {offering.programName}
            </Link>
            <span className="text-muted flex flex-wrap items-center gap-1.5 truncate text-xs">
              {offering.institutionShort}
              {placement.verified && <VerifiedBadge />}
              {placement.destacado && <DestacadoBadge />}
            </span>
          </div>
        </div>
        <span className="text-body text-sm">{MANAGEMENT_LABELS[offering.management]}</span>
        <span className="text-body text-sm">{MODALITY_LABELS[offering.modality]}</span>
        <span
          className={cn(
            'font-mono text-sm',
            offering.durationMonths != null ? 'text-ink' : 'text-muted',
          )}
        >
          {duration}
        </span>
        <PriceLabel price={offering.price} />
        <AccreditationBadge accreditation={offering.accreditation} />
      </div>

      {/* Mobile: the D4 compact card, never a scrolling table (design-system.md §7) */}
      <div className="px-4 py-4 lg:hidden">
        <div className="flex items-start gap-2.5">
          <CompareCheckbox entry={compareLabel(offering)} className="mt-0.5" />
          <InstitutionMonogram
            institutionShort={offering.institutionShort}
            brandColor={offering.brandColor}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <Link
              href={href}
              className="focus-visible:ring-ink text-ink block text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              {offering.programName}
            </Link>
            <span className="text-muted flex flex-wrap items-center gap-1.5 truncate text-xs">
              {offering.institutionShort}
              {placement.verified && <VerifiedBadge />}
              {placement.destacado && <DestacadoBadge />}
            </span>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          <Cell term="Gestión">
            <span className="text-body text-sm">{MANAGEMENT_LABELS[offering.management]}</span>
          </Cell>
          <Cell term="Duración">
            <span
              className={cn(
                'font-mono text-sm',
                offering.durationMonths != null ? 'text-ink' : 'text-muted',
              )}
            >
              {duration}
            </span>
          </Cell>
          <Cell term="Arancel">
            <PriceLabel price={offering.price} />
          </Cell>
          <Cell term="Acreditación">
            <AccreditationBadge accreditation={offering.accreditation} />
          </Cell>
        </dl>
      </div>
    </>
  );
}

function Cell({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-faint text-xs">{term}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function ColumnHeader({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted text-xs font-semibold tracking-wide uppercase">{children}</span>
  );
}

/**
 * A sortable column. Clicking cycles through the keys the column owns, so
 * "Arancel" goes ascending → descending → ascending. The arrow shows which of
 * its own keys is active, and nothing here is accent-coloured.
 */
function SortHeader({
  label,
  keys,
  sort,
  sortHref,
}: {
  label: string;
  keys: readonly SortKey[];
  sort: SortKey;
  sortHref: (key: SortKey) => string;
}) {
  const activeIndex = keys.indexOf(sort);
  const next = keys[(activeIndex + 1) % keys.length];
  const isActive = activeIndex >= 0;

  return (
    <a
      href={sortHref(next)}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'focus-visible:ring-ink inline-flex items-center gap-1 rounded-sm text-xs font-semibold tracking-wide uppercase focus-visible:ring-2 focus-visible:outline-none',
        isActive ? 'text-ink' : 'text-muted hover:text-ink',
      )}
    >
      {label}
      <svg aria-hidden viewBox="0 0 24 24" className="size-3 fill-none stroke-current stroke-[2.2]">
        <path d="M8 9l4-4 4 4M8 15l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">Ordenar</span>
    </a>
  );
}
