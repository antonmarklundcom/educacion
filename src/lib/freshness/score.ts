/**
 * Staleness scoring, as a pure function (PR-33).
 *
 * ### What a score is for
 *
 * `/admin/frescura` already counted things. What it could not do is **rank**
 * them: with 600 aranceles past their date, "which do I re-verify first" is
 * the only question that matters, and a count does not answer it. A score does,
 * and it is deliberately simple enough to explain to the person doing the work:
 *
 *   score = age beyond the review interval, in days, weighted by how visible
 *           the record is
 *
 * A never-verified record scores as if it were exactly one interval overdue —
 * not infinite. Infinity would park every unverified row at the top forever and
 * bury the ones we published a number for and then let rot, which are the ones
 * that actively mislead somebody.
 *
 * ### Why weights, and why these
 *
 * A stale arancel on a published, popular carrera is worse than one on a draft
 * nobody can reach. The weight is the only judgement in the formula and it is
 * stated rather than tuned: published beats draft, and a record whose value is
 * *displayed* beats one that only feeds a filter.
 */

export type FreshnessLevel = 'fresh' | 'aging' | 'stale' | 'never';

export interface FreshnessInput {
  verifiedAt: Date | null;
  /** How long this kind of record may go unreviewed. */
  intervalMonths: number;
  /** Fraction of the interval at which it starts counting as "aging". */
  agingAt?: number;
  /** 1 = normal. Higher for records a visitor actually reads. */
  weight?: number;
}

export interface FreshnessScore {
  level: FreshnessLevel;
  /** Days since verification; null when it was never verified. */
  ageDays: number | null;
  /** Days past the review interval. Negative when still inside it. */
  overdueDays: number;
  /** `overdueDays × weight`, floored at 0. The sort key of the work queue. */
  score: number;
}

const DAY = 86_400_000;

/** Months → days at the boundary this codebase uses everywhere else (30.44). */
function intervalDays(months: number): number {
  return Math.round(months * 30.44);
}

export function scoreFreshness(input: FreshnessInput, now: Date = new Date()): FreshnessScore {
  const interval = intervalDays(input.intervalMonths);
  const weight = input.weight ?? 1;
  const agingAt = input.agingAt ?? 0.75;

  if (!input.verifiedAt) {
    // One interval overdue, not infinite — see the docstring.
    const overdueDays = interval;
    return { level: 'never', ageDays: null, overdueDays, score: overdueDays * weight };
  }

  const ageDays = Math.floor((now.getTime() - input.verifiedAt.getTime()) / DAY);
  const overdueDays = ageDays - interval;
  const level: FreshnessLevel =
    overdueDays > 0 ? 'stale' : ageDays >= interval * agingAt ? 'aging' : 'fresh';

  return { level, ageDays, overdueDays, score: Math.max(0, overdueDays) * weight };
}

/** The weights, named. Changing one is a decision, so it is not a magic number. */
export const FRESHNESS_WEIGHTS = {
  /** An arancel a visitor reads on the page and compares on. */
  publishedPrice: 3,
  /** A price on a draft offering: real work, invisible to anybody today. */
  draftPrice: 1,
  /** An accreditation badge — the wedge, and the biggest liability (R-09). */
  accreditation: 4,
  /** A convocatoria whose window has closed and is still marked active. */
  admission: 2,
} as const;

/** Human wording for a level. One place, so the digest and the admin agree. */
export const FRESHNESS_LABELS: Record<FreshnessLevel, string> = {
  fresh: 'Al día',
  aging: 'Por vencer',
  stale: 'Vencido',
  never: 'Nunca verificado',
};
