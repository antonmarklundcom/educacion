/**
 * The scheduled half of the freshness system (PR-33) — the four jobs
 * `architecture.md` §10 listed and nothing had implemented, plus the leads
 * purge the privacy policy already promised.
 *
 * All idempotent, all safe to fire twice, none of them destructive **except**
 * the purge, which is destructive on purpose (see below).
 */

import { lt, sql } from 'drizzle-orm';

import { db, type Db } from '@/db';
import { leads } from '@/db/schema';
import { purgeUsedResetTokens } from '@/db/queries/password-reset';
import { rebuildProgramSearch } from '@/db/queries/rebuild-search';
import { refreshEnrollmentStatuses } from '@/db/queries/admin/admissions';
import { stalenessCountsForCron } from '@/db/queries/admin/staleness';

import { sendStalenessDigest } from './digest';

/** `risks.md` §R-06 and `/legal/privacidad`: leads are kept 24 months. */
export const LEAD_RETENTION_MONTHS = 24;

/** `GET /api/cron/rebuild-search` — the nightly index rebuild (§10). */
export async function runSearchRebuild() {
  const summary = await rebuildProgramSearch();
  return { rows: summary.rows, published: summary.published, tookMs: summary.tookMs };
}

/** `GET /api/cron/admissions` — recompute `offerings.enrollment_status` (§10). */
export async function runAdmissionsRefresh(now: Date = new Date()) {
  const updated = await refreshEnrollmentStatuses(now);
  return { offeringsUpdated: updated };
}

/** `GET /api/cron/staleness` — the weekly digest. Reports; never acts. */
export async function runStalenessDigest(now: Date = new Date()) {
  const counts = await stalenessCountsForCron(now);
  const result = await sendStalenessDigest(counts);
  return { ...counts, sent: result.sent, reason: result.reason };
}

/**
 * `GET /api/cron/purge-leads` — the one job here that deletes.
 *
 * `/legal/privacidad` tells every person who submits a form that we keep their
 * data for 24 months. Until now nothing enforced it (`risks.md` §R-06 said so
 * in writing, and named this PR). A promise in a privacy policy that the code
 * does not keep is the worst kind of untrue sentence on this site, so this is a
 * real `DELETE`, not an archive.
 *
 * **PR-33's stale-price policy change does not touch this.** Showing an old
 * arancel with a warning is a judgement about usefulness; keeping somebody's
 * phone number past what we told them is a broken commitment. Different rules,
 * different directions.
 *
 * Idempotent: the second run finds nothing, because the rows are gone.
 */
export async function runLeadPurge(now: Date = new Date(), database: Db = db) {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - LEAD_RETENTION_MONTHS);

  const [before] = await database
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(lt(leads.createdAt, cutoff));

  const deletable = Number(before?.count ?? 0);
  if (deletable > 0) {
    await database.delete(leads).where(lt(leads.createdAt, cutoff));
  }

  // Spent and expired reset tokens ride along (PR-35): they are not evidence
  // of anything once used, and a table of dead credentials is a liability with
  // no upside. Same job because it is the same kind of housekeeping, and one
  // cron entry is one thing to forget instead of two.
  const resetTokens = await purgeUsedResetTokens(now, database);

  return {
    deleted: deletable,
    resetTokensPurged: resetTokens,
    cutoff: cutoff.toISOString().slice(0, 10),
  };
}
