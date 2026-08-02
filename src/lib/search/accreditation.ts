/**
 * Resolving many accreditation rows into the one badge a card can show.
 *
 * A single offering can be covered by several `accreditations` rows at once:
 * an institutional habilitación from CONES, a program-level ANEAES
 * acreditación, sometimes an offering-level one for a specific sede, plus
 * superseded historical rows. The card shows one badge, so the index has to
 * pick — and the rule has to be written down, because "whichever row the join
 * happened to return" is how a site ends up claiming an institution is
 * accredited on the strength of an expired resolution for a different campus.
 *
 * ### The precedence rule (documented, in order)
 *
 * 1. **Disputed rows are dropped.** `is_disputed` is set by the institution
 *    dispute flow (PR-24) and suppresses the public badge entirely.
 * 2. **Uncited claims are dropped.** A row whose status asserts something but
 *    carries neither `source_url` nor `resolution_number` cannot be shown —
 *    the DB CHECK already refuses to store one, and this is the second gate
 *    (`hasRequiredCitation`, CLAUDE.md rule 2).
 * 3. **Expiry is applied before ranking.** A `vigente` row whose `valid_to` is
 *    in the past is treated as `vencida`. The resolution existed; its validity
 *    did not survive the date, and rendering it as current would be a false
 *    claim.
 * 4. **Specificity wins outright:** offering > program > institution. The most
 *    specific scope that still has a surviving row decides, even when a
 *    broader row looks better. An institution-wide habilitación does not get
 *    to overrule what ANEAES said about this particular program.
 * 5. **Within that scope, status precedence:** vigente > en_proceso > vencida >
 *    no_acreditada > sin_datos.
 * 6. **Ties break on recency** — `resolution_date`, then `verified_at`, then
 *    the lowest id so the rebuild is deterministic.
 * 7. **Nothing survives ⇒ `sin_datos`**, with no agency and no source. Never
 *    `no_acreditada`: an unverified negative is the legally dangerous claim
 *    (risks.md §R-09).
 */

import { hasRequiredCitation } from '@/db/invariants';

import type { AccreditationAgency, AccreditationStatus, AccreditationSummary } from './contract';

export type AccreditationScope = 'institution' | 'program' | 'offering';

export interface AccreditationCandidate {
  id: number;
  scope: AccreditationScope;
  agency: AccreditationAgency;
  status: AccreditationStatus;
  sourceUrl: string | null;
  resolutionNumber: string | null;
  resolutionDate: string | null;
  validTo: string | null;
  verifiedAt: Date | null;
  isDisputed: boolean;
}

const SCOPE_RANK: Record<AccreditationScope, number> = {
  offering: 3,
  program: 2,
  institution: 1,
};

const STATUS_RANK: Record<AccreditationStatus, number> = {
  vigente: 5,
  en_proceso: 4,
  vencida: 3,
  no_acreditada: 2,
  sin_datos: 1,
};

export const NO_ACCREDITATION_DATA: AccreditationSummary = {
  status: 'sin_datos',
  agency: null,
  sourceUrl: null,
  validTo: null,
};

/** `YYYY-MM-DD` in UTC — the format every `date` column in the schema uses. */
export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function effectiveStatus(row: AccreditationCandidate, today: string): AccreditationStatus {
  if (row.status === 'vigente' && row.validTo != null && row.validTo < today) return 'vencida';
  return row.status;
}

function isUsable(row: AccreditationCandidate): boolean {
  if (row.isDisputed) return false;
  const citation = {
    status: row.status,
    sourceUrl: row.sourceUrl,
    resolutionNumber: row.resolutionNumber,
  };
  if (!hasRequiredCitation(citation)) return false;
  // `hasRequiredCitation` only guards the positive statuses. `no_acreditada`
  // asserts a negative and is held to the same bar by
  // `assertAccreditationStatusIsSafe`; the index applies that rule too, so an
  // uncited negative degrades to "sin datos" instead of becoming a badge.
  if (row.status === 'no_acreditada') {
    return Boolean(row.sourceUrl?.trim() || row.resolutionNumber?.trim());
  }
  return true;
}

function compare(
  a: { row: AccreditationCandidate; status: AccreditationStatus },
  b: { row: AccreditationCandidate; status: AccreditationStatus },
): number {
  const byStatus = STATUS_RANK[b.status] - STATUS_RANK[a.status];
  if (byStatus !== 0) return byStatus;
  const byResolution = (b.row.resolutionDate ?? '').localeCompare(a.row.resolutionDate ?? '');
  if (byResolution !== 0) return byResolution;
  const byVerified = (b.row.verifiedAt?.getTime() ?? 0) - (a.row.verifiedAt?.getTime() ?? 0);
  if (byVerified !== 0) return byVerified;
  return a.row.id - b.row.id;
}

/**
 * The one badge for a row of `program_search`.
 *
 * `candidates` is every accreditation attached to the offering, to its program
 * or to its institution — in any order.
 */
export function resolveAccreditation(
  candidates: readonly AccreditationCandidate[],
  now: Date = new Date(),
): AccreditationSummary {
  const today = toDateOnly(now);

  const usable = candidates
    .filter(isUsable)
    .map((row) => ({ row, status: effectiveStatus(row, today) }));
  if (usable.length === 0) return NO_ACCREDITATION_DATA;

  const bestScope = Math.max(...usable.map((entry) => SCOPE_RANK[entry.row.scope]));
  const winner = usable
    .filter((entry) => SCOPE_RANK[entry.row.scope] === bestScope)
    .sort(compare)[0];

  return {
    status: winner.status,
    agency: winner.row.agency,
    sourceUrl: winner.row.sourceUrl,
    validTo: winner.row.validTo,
  };
}
