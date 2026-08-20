/**
 * The comparison matrix: which attributes are compared, in what order, and
 * which of them actually differ.
 *
 * Difference highlighting is the entire value of a comparison table — if
 * everything looks equally important the user still has to read all of it.
 * So each row knows whether its values agree; the renderer dims the ones that
 * do and emphasises the ones that do not.
 *
 * Pure on purpose: no React, no DB, no formatting decisions of its own beyond
 * reusing the ones the card view already made (`priceDisplay`,
 * `accreditationLabel`), so the comparador cannot word a fact differently from
 * the results page it was reached from.
 */

import { accreditationLabel } from '@/components/browse/accreditation-display';
import { STALE_LABEL, STALE_UNKNOWN_LABEL, priceDisplay } from '@/components/browse/price';
import { copy } from '@/lib/copy';
import { formatDurationMonths } from '@/lib/format';
import { cheapestTotalIndex, totalCost } from '@/lib/prices/total-cost';
import { compareCellLabel } from '@/lib/prices/total-cost-display';
import {
  ENROLLMENT_STATUS_LABELS,
  LEVEL_LABELS,
  MANAGEMENT_LABELS,
  MODALITY_LABELS,
  SHIFT_LABELS,
  type OfferingSummary,
} from '@/lib/search';

/** The wording for "we do not have this", used wherever a field is null. */
export const NO_DATA = 'Sin datos';

export interface CompareCell {
  text: string;
  /** True when the cell is an honest gap rather than a value. */
  isGap: boolean;
  /** A small aside under the value — currently only "el más barato". */
  note?: string;
}

export interface CompareRow {
  key: string;
  label: string;
  cells: CompareCell[];
  /** False when every column agrees — the renderer dims those rows. */
  isDifferent: boolean;
  /** Numeric-ish rows render in IBM Plex Mono (design-system.md §3). */
  isNumeric: boolean;
}

type Extractor = {
  key: string;
  label: string;
  isNumeric?: boolean;
  of: (offering: OfferingSummary) => CompareCell;
};

function value(text: string): CompareCell {
  return { text, isGap: false };
}

function gap(): CompareCell {
  return { text: NO_DATA, isGap: true };
}

const EXTRACTORS: readonly Extractor[] = [
  { key: 'institution', label: 'Institución', of: (o) => value(o.institutionShort) },
  { key: 'campus', label: 'Sede', of: (o) => value(o.campusName) },
  { key: 'city', label: 'Ciudad', of: (o) => value(`${o.cityName}, ${o.departmentName}`) },
  { key: 'management', label: 'Gestión', of: (o) => value(MANAGEMENT_LABELS[o.management]) },
  { key: 'level', label: 'Nivel', of: (o) => value(LEVEL_LABELS[o.level]) },
  { key: 'modality', label: 'Modalidad', of: (o) => value(MODALITY_LABELS[o.modality]) },
  { key: 'shift', label: 'Turno', of: (o) => value(SHIFT_LABELS[o.shift]) },
  {
    key: 'duration',
    label: 'Duración',
    isNumeric: true,
    of: (o) => (o.durationMonths != null ? value(formatDurationMonths(o.durationMonths)) : gap()),
  },
  {
    key: 'price',
    label: 'Arancel',
    isNumeric: true,
    of: (o) => {
      // Since PR-33 a stale arancel is compared like any other, and the cell
      // carries its date so the reader can see one column is older than the
      // next — which is exactly the comparison they came here to make
      // (CLAUDE.md rule 3).
      const display = priceDisplay(o.price);
      if (display.isGap) return { text: display.label, isGap: true };
      const amount = `${display.label}${display.unit ?? ''}`;
      // "dato de mayo de 2026" alone reads as provenance; rule 3 asks for the
      // words. PR-48 fixed the wording here as well as on the total below, so
      // the two cells of the same column cannot warn differently.
      return value(
        display.isStale
          ? `${amount} · ${display.verifiedLabel ? `${STALE_LABEL} (${display.verifiedLabel})` : STALE_UNKNOWN_LABEL}`
          : amount,
      );
    },
  },
  {
    key: 'totalCost',
    label: copy.totalCost.compareLabel,
    isNumeric: true,
    of: (o) => {
      // Composed here from the same PriceSummary the arancel row reads, so the
      // two cells cannot disagree. A stale total keeps its date for the same
      // reason the arancel cell does (PR-33).
      const total = totalCost(o.price, o.durationMonths);
      const text = compareCellLabel(total);
      return total.kind === 'partial' ? { text, isGap: true } : value(text);
    },
  },
  {
    key: 'accreditation',
    label: 'Acreditación',
    of: (o) => ({
      text: accreditationLabel(o.accreditation),
      isGap: o.accreditation.status === 'sin_datos',
    }),
  },
  {
    key: 'enrollment',
    label: 'Inscripción',
    of: (o) =>
      o.enrollmentStatus === 'sin_datos'
        ? { text: 'Sin datos de inscripción', isGap: true }
        : value(ENROLLMENT_STATUS_LABELS[o.enrollmentStatus]),
  },
  {
    key: 'title',
    label: 'Título que otorga',
    of: (o) => (o.titleAwarded ? value(o.titleAwarded) : gap()),
  },
];

export function buildCompareRows(offerings: readonly OfferingSummary[]): CompareRow[] {
  const cheapest = cheapestTotalIndex(
    offerings.map((offering) => totalCost(offering.price, offering.durationMonths)),
  );

  return EXTRACTORS.map((extractor) => {
    const cells = offerings.map((offering, index) => {
      const cell = extractor.of(offering);
      return extractor.key === 'totalCost' && index === cheapest
        ? { ...cell, note: copy.totalCost.cheapest }
        : cell;
    });
    return {
      key: extractor.key,
      label: extractor.label,
      cells,
      isDifferent: new Set(cells.map((cell) => cell.text)).size > 1,
      isNumeric: extractor.isNumeric ?? false,
    };
  });
}

/** For the page's summary line: "8 de 12 datos difieren". */
export function countDifferences(rows: readonly CompareRow[]): number {
  return rows.filter((row) => row.isDifferent).length;
}
