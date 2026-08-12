/**
 * The staleness dashboard and the bulk verify action (PR-20). CLAUDE.md rule 5.
 *
 * ### What "stale" means here
 *
 * For an **arancel** it is not an opinion: `PRICE_MAX_AGE_MONTHS` is 12 and a
 * price past it is not displayed anywhere (`invariants.ts`,
 * `data-model.md` §2). So this page has two populations that matter and they
 * are different problems — *already hidden* (the number is gone from the site
 * right now) and *about to be* (still showing, expires within 60 days). The
 * second is the work queue; the first is the backlog.
 *
 * For **accreditations** and **admissions** there is no display rule, so
 * "stale" is a review interval rather than a boundary: 12 months for an
 * accreditation, and for an admission the fact that its window has closed.
 * Those thresholds are stated here as constants rather than hidden in a query,
 * because they are a choice about how hard we work, not a rule about what we
 * publish.
 *
 * ### Bulk verify is a human assertion, and is logged as one
 *
 * `bulkVerify` stamps `verified_at = now()` and `verified_by_user_id`. It does
 * **not** re-check anything — nothing in this codebase can — so what it records
 * is "on this date, this person said this is still true". That is why it takes
 * an explicit list of ids and nothing selects them by default, why it refuses
 * an empty list, and why every stamp lands in `activity_log` with the actor's
 * name: a bulk verify is the one action here that can quietly extend the life
 * of a wrong number, and the log is what makes it answerable afterwards
 * (`risks.md` §R-03).
 */

import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { PRICE_MAX_AGE_MONTHS } from '@/db/invariants';
import {
  accreditations,
  admissions,
  campuses,
  institutions,
  offerings,
  prices,
  programs,
} from '@/db/schema';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';

import { logActivity } from './activity-log';
import { rebuildProgramSearch } from '../rebuild-search';

/** How long before the 12-month cliff a price counts as "urgente". */
export const PRICE_WARNING_DAYS = 60;
/** Review interval for an accreditation. Not a display rule — a work rhythm. */
export const ACCREDITATION_REVIEW_MONTHS = 12;

export type VerifiableTable = 'prices' | 'accreditations' | 'admissions';

function monthsAgo(months: number, now: Date): Date {
  const date = new Date(now.getTime());
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

function daysFromNow(days: number, now: Date): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

export interface StalenessCounts {
  /** Current prices whose 12 months have already passed — hidden on the site now. */
  pricesExpired: number;
  /** Current prices expiring within `PRICE_WARNING_DAYS`. */
  pricesExpiringSoon: number;
  /** Current prices that were never verified at all. */
  pricesNeverVerified: number;
  accreditationsStale: number;
  admissionsClosed: number;
  offeringsWithoutPrice: number;
}

export async function stalenessCounts(
  actor: SessionUser | null | undefined,
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<StalenessCounts> {
  requireRole(actor, ['editor']);

  const cutoff = monthsAgo(PRICE_MAX_AGE_MONTHS, now);
  const warnCutoff = monthsAgo(PRICE_MAX_AGE_MONTHS, daysFromNow(PRICE_WARNING_DAYS, now));
  const accreditationCutoff = monthsAgo(ACCREDITATION_REVIEW_MONTHS, now);
  const today = now.toISOString().slice(0, 10);

  const one = async (query: Promise<Array<{ count: number }>>) =>
    Number((await query)[0]?.count ?? 0);

  const [
    pricesExpired,
    pricesExpiringSoon,
    pricesNeverVerified,
    accreditationsStale,
    admissionsClosed,
    offeringsWithoutPrice,
  ] = await Promise.all([
    one(
      database
        .select({ count: sql<number>`count(*)` })
        .from(prices)
        .where(
          and(
            eq(prices.isCurrent, true),
            isNotNull(prices.verifiedAt),
            lt(prices.verifiedAt, cutoff),
          ),
        ),
    ),
    one(
      database
        .select({ count: sql<number>`count(*)` })
        .from(prices)
        .where(
          and(
            eq(prices.isCurrent, true),
            isNotNull(prices.verifiedAt),
            lt(prices.verifiedAt, warnCutoff),
            sql`${prices.verifiedAt} >= ${cutoff}`,
          ),
        ),
    ),
    one(
      database
        .select({ count: sql<number>`count(*)` })
        .from(prices)
        .where(and(eq(prices.isCurrent, true), isNull(prices.verifiedAt))),
    ),
    one(
      database
        .select({ count: sql<number>`count(*)` })
        .from(accreditations)
        .where(
          and(
            // `sin_datos` rows are not a claim, so there is nothing to re-verify.
            sql`${accreditations.status} <> 'sin_datos'`,
            or(
              isNull(accreditations.verifiedAt),
              lt(accreditations.verifiedAt, accreditationCutoff),
            ),
          ),
        ),
    ),
    one(
      database
        .select({ count: sql<number>`count(*)` })
        .from(admissions)
        .where(
          and(
            eq(admissions.isActive, true),
            isNotNull(admissions.registrationCloses),
            sql`${admissions.registrationCloses} < ${today}`,
          ),
        ),
    ),
    one(
      database
        .select({ count: sql<number>`count(*)` })
        .from(offerings)
        .leftJoin(prices, and(eq(prices.offeringId, offerings.id), eq(prices.isCurrent, true)))
        .where(and(eq(offerings.status, 'published'), isNull(prices.id))),
    ),
  ]);

  return {
    pricesExpired,
    pricesExpiringSoon,
    pricesNeverVerified,
    accreditationsStale,
    admissionsClosed,
    offeringsWithoutPrice,
  };
}

export interface StalePriceRow {
  id: number;
  offeringId: number;
  institutionShort: string;
  programName: string;
  campusName: string;
  monthlyFee: number | null;
  annualCost: number | null;
  isFree: boolean;
  verifiedAt: Date | null;
  sourceUrl: string | null;
}

/** The oldest-first work queue: what to re-verify next. */
export async function listStalePrices(
  actor: SessionUser | null | undefined,
  options: { limit?: number; includeSoon?: boolean } = {},
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<StalePriceRow[]> {
  requireRole(actor, ['editor']);

  const boundary = options.includeSoon
    ? monthsAgo(PRICE_MAX_AGE_MONTHS, daysFromNow(PRICE_WARNING_DAYS, now))
    : monthsAgo(PRICE_MAX_AGE_MONTHS, now);

  const rows = await database
    .select({
      id: prices.id,
      offeringId: prices.offeringId,
      institutionShort: institutions.nameShort,
      programName: programs.nameOfficial,
      campusName: campuses.name,
      monthlyFee: prices.monthlyFee,
      annualCost: prices.annualCost,
      isFree: prices.isFree,
      verifiedAt: prices.verifiedAt,
      sourceUrl: prices.sourceUrl,
    })
    .from(prices)
    .innerJoin(offerings, eq(offerings.id, prices.offeringId))
    .innerJoin(programs, eq(programs.id, offerings.programId))
    .innerJoin(campuses, eq(campuses.id, offerings.campusId))
    .innerJoin(institutions, eq(institutions.id, programs.institutionId))
    .where(
      and(
        eq(prices.isCurrent, true),
        or(isNull(prices.verifiedAt), lt(prices.verifiedAt, boundary)),
      ),
    )
    // Nulls first is what we want: a price that was never verified is the most
    // urgent of all, and MySQL sorts NULL before every value ascending.
    .orderBy(asc(prices.verifiedAt))
    .limit(Math.min(options.limit ?? 50, 200));

  return rows as StalePriceRow[];
}

export interface BulkVerifyResult {
  updated: number;
}

/**
 * Stamp `verified_at` on rows a human has just re-checked.
 *
 * Deliberately narrow: one table, an explicit list of ids, capped. There is no
 * "verify everything stale" affordance and there should not be one — the whole
 * value of `verified_at` is that somebody looked, and a button that stamps a
 * thousand rows is a button that makes the field mean nothing.
 */
export async function bulkVerify(
  actor: SessionUser | null | undefined,
  table: VerifiableTable,
  ids: readonly number[],
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<BulkVerifyResult> {
  const user = requireRole(actor, ['editor']);

  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (unique.length === 0) throw new Error('No seleccionaste ninguna fila para verificar.');
  if (unique.length > 200) {
    throw new Error(
      'Máximo 200 filas por vez. Verificar en lote es una afirmación tuya sobre cada fila, ' +
        'no una operación masiva.',
    );
  }

  const stamp = { verifiedAt: now, verifiedByUserId: user.id };

  if (table === 'prices') {
    await database.update(prices).set(stamp).where(inArray(prices.id, unique));
  } else if (table === 'accreditations') {
    await database.update(accreditations).set(stamp).where(inArray(accreditations.id, unique));
  } else {
    await database.update(admissions).set(stamp).where(inArray(admissions.id, unique));
  }

  await logActivity(database, {
    userId: user.id,
    entityType: table,
    entityId: null,
    action: 'update',
    before: null,
    // The ids are the record: "who said these were still true, and when".
    after: { action: 'bulk_verify', ids: unique, verifiedAt: now.toISOString() },
  });

  // Only prices change what the public site renders — `price_expires_on` moves.
  if (table === 'prices') await rebuildProgramSearch({ db: database });

  return { updated: unique.length };
}

/**
 * The same counts as `stalenessCounts`, for the weekly cron (PR-33).
 *
 * No `SessionUser`: the caller is `/api/cron/staleness`, already authenticated
 * by `CRON_SECRET` before the route reaches it (`architecture.md` §10). It is
 * a separate export rather than an optional argument on `stalenessCounts`,
 * because "the role check is optional" is exactly the shape that ends up
 * called from a page one day.
 */
export async function stalenessCountsForCron(
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<StalenessCounts> {
  return stalenessCounts(
    { id: 0, role: 'admin', institutionId: null, mustChangePassword: false },
    now,
    database,
  );
}
