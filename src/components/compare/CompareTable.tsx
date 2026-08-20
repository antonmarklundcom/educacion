/**
 * The comparison itself. A server component — a shared `/comparar` link has to
 * render on the server or it previews as an empty page in WhatsApp.
 *
 * Rows whose values all agree are dimmed; rows that differ are emphasised
 * (architecture.md §5). Gaps are dimmed too and say "Sin datos" — a blank cell
 * reads as "free" or "none" and both would be a claim we cannot make.
 *
 * Desktop is a column-per-program grid. Mobile stacks by attribute rather than
 * scrolling sideways (design-system.md §7), which is also why four columns are
 * usable on a phone.
 */

import Link from 'next/link';

import { AccreditationBadge, InstitutionMonogram, offeringHref } from '@/components/browse';
import { cn } from '@/lib/cn';
import type { OfferingSummary } from '@/lib/search';

import { buildCompareRows, countDifferences } from './rows';

export function CompareTable({ offerings }: { offerings: readonly OfferingSummary[] }) {
  const rows = buildCompareRows(offerings);
  const differences = countDifferences(rows);
  const columns = offerings.length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-sm">
        {differences === 0
          ? 'Estas carreras coinciden en todos los datos que tenemos.'
          : `${differences} de ${rows.length} datos difieren. Los iguales están atenuados.`}
      </p>

      {/* Desktop: one column per program */}
      <div className="border-border bg-surface hidden overflow-hidden rounded-lg border lg:block">
        <div
          className="grid items-stretch"
          style={{ gridTemplateColumns: `10rem repeat(${columns}, minmax(0, 1fr))` }}
        >
          <div className="border-border bg-card-alt border-b px-4 py-4" />
          {offerings.map((offering) => (
            <div
              key={offering.offeringId}
              className="border-border bg-card-alt border-b border-l px-4 py-4"
            >
              <ProgramHeader offering={offering} />
            </div>
          ))}

          {rows.map((row) => (
            <div key={row.key} className="contents">
              <div
                className={cn(
                  'border-border border-b px-4 py-3 text-xs font-semibold tracking-wide uppercase',
                  row.isDifferent ? 'text-ink' : 'text-faint',
                )}
              >
                {row.label}
              </div>
              {row.cells.map((cell, index) => (
                <div
                  key={`${row.key}-${offerings[index]?.offeringId ?? index}`}
                  className={cn(
                    'border-border border-b border-l px-4 py-3 text-sm',
                    row.isNumeric && 'font-mono',
                    cell.isGap
                      ? 'text-muted'
                      : row.isDifferent
                        ? 'text-ink font-medium'
                        : 'text-faint',
                  )}
                >
                  {row.key === 'accreditation' ? (
                    <AccreditationBadge accreditation={offerings[index]!.accreditation} />
                  ) : (
                    <>
                      {cell.text}
                      {cell.note && (
                        <span className="text-ok mt-0.5 block font-sans text-xs font-medium">
                          {cell.note}
                        </span>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: stacked by attribute, never a sideways scroll */}
      <div className="flex flex-col gap-4 lg:hidden">
        <ul className="flex flex-col gap-2">
          {offerings.map((offering, index) => (
            <li
              key={offering.offeringId}
              className="border-border bg-surface rounded-lg border px-4 py-3"
            >
              <span className="text-faint text-xs">Opción {index + 1}</span>
              <ProgramHeader offering={offering} />
            </li>
          ))}
        </ul>

        {rows.map((row) => (
          <div key={row.key} className="border-border bg-surface rounded-lg border px-4 py-3">
            <h3
              className={cn(
                'text-xs font-semibold tracking-wide uppercase',
                row.isDifferent ? 'text-ink' : 'text-faint',
              )}
            >
              {row.label}
            </h3>
            <dl className="mt-2 flex flex-col gap-1.5">
              {row.cells.map((cell, index) => (
                <div
                  key={`${row.key}-${offerings[index]?.offeringId ?? index}`}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt className="text-muted truncate text-xs">
                    {offerings[index]?.institutionShort}
                  </dt>
                  <dd
                    className={cn(
                      'shrink-0 text-sm',
                      row.isNumeric && 'font-mono',
                      cell.isGap
                        ? 'text-muted'
                        : row.isDifferent
                          ? 'text-ink font-medium'
                          : 'text-faint',
                    )}
                  >
                    {cell.text}
                    {cell.note && (
                      <span className="text-ok mt-0.5 block font-sans text-xs font-medium">
                        {cell.note}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgramHeader({ offering }: { offering: OfferingSummary }) {
  return (
    <div className="flex items-start gap-2.5">
      <InstitutionMonogram
        institutionShort={offering.institutionShort}
        brandColor={offering.brandColor}
        size="sm"
      />
      <div className="min-w-0">
        <Link
          href={offeringHref(offering)}
          className="focus-visible:ring-ink text-ink block text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {offering.programName}
        </Link>
        <span className="text-muted block truncate text-xs">{offering.institutionShort}</span>
      </div>
    </div>
  );
}
