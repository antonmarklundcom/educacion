/**
 * The comparador's selection, as pure functions.
 *
 * The selection is an **ordered list of offering ids, max 4** (contract,
 * `MAX_COMPARE`). Order matters: the compare columns follow the order the user
 * picked, not the database's. Everything here is deliberately free of React
 * and of `@/db` so the same rules govern the URL on the server, the checkbox
 * in the browser and the `localStorage` mirror, and so they can be tested
 * without either.
 *
 * Where the selection lives (architecture.md §5):
 *  - **URL** — the shareable, server-readable source of truth. Every link the
 *    server renders carries it, and `/comparar` reads it and nothing else.
 *  - **`localStorage`** — the mirror that survives navigating to a detail page
 *    and back, and switching between the card and the table view.
 */

// Imported from the contract, not the `@/lib/search` barrel: the barrel also
// exports `searchPrograms`, which pulls Drizzle and mysql2 into whatever
// imports it — and this module is used by client components.
import { MAX_COMPARE } from '@/lib/search/contract';

export const COMPARE_STORAGE_KEY = 'educacion.comparar';

/**
 * The display labels that travel with the selection.
 *
 * The URL carries ids, because ids are what `/comparar` re-reads from the
 * database. The sticky bar has to *name* what you picked, though, and a
 * program selected three pages ago is not in the current page's results — so
 * the name the user already saw rides along in the mirror rather than costing
 * a query. It is display text only; nothing is ever asserted from it.
 */
export const COMPARE_LABELS_STORAGE_KEY = 'educacion.comparar.labels';

export interface CompareLabel {
  id: number;
  programName: string;
  institutionShort: string;
  brandColor: string | null;
}

/** Never throws: a corrupted mirror degrades to "no labels", not to a crash. */
export function parseCompareLabels(raw: string | null | undefined): CompareLabel[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (typeof entry !== 'object' || entry == null) return [];
      const { id, programName, institutionShort, brandColor } = entry as Record<string, unknown>;
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return [];
      if (typeof programName !== 'string' || typeof institutionShort !== 'string') return [];
      return [
        {
          id,
          programName,
          institutionShort,
          brandColor: typeof brandColor === 'string' ? brandColor : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

/** `/comparar` takes its ids under `ids` (pr-plan.md, PR-09). */
export const COMPARE_IDS_PARAM = 'ids';

export type CompareInput = string | string[] | undefined | null;

/**
 * Parse a selection from a URL value or a `localStorage` string.
 *
 * Never throws and never rejects the whole list for one bad member: a stale
 * link with a deleted id should still compare the rest. Duplicates collapse,
 * order is preserved, and the result is capped at `MAX_COMPARE` — a
 * hand-edited URL with 40 ids compares the first four.
 */
export function parseCompareIds(input: CompareInput, max: number = MAX_COMPARE): number[] {
  if (input == null) return [];
  const raw = Array.isArray(input) ? input : [input];
  const ids: number[] = [];
  const seen = new Set<number>();

  for (const value of raw.flatMap((entry) => entry.split(','))) {
    const trimmed = value.trim();
    if (!/^\d{1,12}$/.test(trimmed)) continue;
    const id = Number(trimmed);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= max) break;
  }

  return ids;
}

/** `''` for an empty selection, so callers can drop the param entirely. */
export function serializeCompareIds(ids: readonly number[]): string {
  return ids.join(',');
}

export interface ToggleResult {
  ids: number[];
  /** True when the id could not be added because the selection is full. */
  rejected: boolean;
}

/**
 * Add or remove one id. Removing always succeeds; adding beyond the ceiling is
 * refused rather than silently evicting the user's first choice — dropping a
 * program someone deliberately picked is the worse failure.
 */
export function toggleCompareId(
  ids: readonly number[],
  id: number,
  max: number = MAX_COMPARE,
): ToggleResult {
  if (ids.includes(id)) {
    return { ids: ids.filter((entry) => entry !== id), rejected: false };
  }
  if (ids.length >= max) {
    return { ids: [...ids], rejected: true };
  }
  return { ids: [...ids, id], rejected: false };
}

/**
 * The display label for one offering, derived from what the row already shows.
 * Kept here so the table, the bar and the mirror cannot disagree about it.
 */
export function compareLabel(offering: {
  offeringId: number;
  programName: string;
  institutionShort: string;
  brandColor: string | null;
}): CompareLabel {
  return {
    id: offering.offeringId,
    programName: offering.programName,
    institutionShort: offering.institutionShort,
    brandColor: offering.brandColor,
  };
}

/** "Comparar 3 carreras" / "Comparar 1 carrera". */
export function compareCtaLabel(count: number): string {
  return count === 1 ? 'Comparar 1 carrera' : `Comparar ${count} carreras`;
}

/** The message shown when the ceiling is hit. Worded once, used everywhere. */
export function compareFullMessage(max: number = MAX_COMPARE): string {
  return `Podés comparar hasta ${max} carreras a la vez. Quitá una para agregar otra.`;
}

/** `/comparar?ids=1,2,3`. Empty selection → the page's own empty state. */
export function compareHref(ids: readonly number[]): string {
  const value = serializeCompareIds(ids);
  return value ? `/comparar?${COMPARE_IDS_PARAM}=${value}` : '/comparar';
}
