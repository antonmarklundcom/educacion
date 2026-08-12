/**
 * Job postings — public reads (PR-32). Rule 5.
 *
 * Expiry is the same predicate-not-cron rule `becas` uses: a posting is shown
 * while `expires_on` (or `posted_on + DEFAULT_TTL_DAYS` when it has none) is
 * still ahead of the request's own date. A vacancy that was filled a month ago
 * is worse than no vacancy at all, and a cron would leave a window.
 */

import { and, desc, eq, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { careers, jobPostings } from '@/db/schema';

/** How long a posting is shown when its source states no expiry. */
export const DEFAULT_TTL_DAYS = 45;

export interface JobPosting {
  id: number;
  title: string;
  employerName: string;
  locationLabel: string | null;
  url: string;
  sourceLabel: string;
  postedOn: string;
  summary: string | null;
}

/** `posted_on + DEFAULT_TTL_DAYS`, in SQL, for rows with no explicit expiry. */
const effectiveExpiry = sql`coalesce(${jobPostings.expiresOn}, date_add(${jobPostings.postedOn}, interval ${DEFAULT_TTL_DAYS} day))`;

export async function listJobPostingsForCareer(
  careerId: number,
  options: { limit?: number; now?: Date } = {},
  database: Db = defaultDb,
): Promise<JobPosting[]> {
  const today = (options.now ?? new Date()).toISOString().slice(0, 10);

  const rows = await database
    .select({
      id: jobPostings.id,
      title: jobPostings.title,
      employerName: jobPostings.employerName,
      locationLabel: jobPostings.locationLabel,
      url: jobPostings.url,
      sourceLabel: jobPostings.sourceLabel,
      postedOn: jobPostings.postedOn,
      summary: jobPostings.summary,
    })
    .from(jobPostings)
    .where(
      and(
        eq(jobPostings.careerId, careerId),
        eq(jobPostings.status, 'published'),
        sql`${effectiveExpiry} >= ${today}`,
      ),
    )
    .orderBy(desc(jobPostings.postedOn), desc(jobPostings.id))
    .limit(options.limit ?? 12);

  return rows.map((row) => ({
    ...row,
    locationLabel: row.locationLabel ?? null,
    summary: row.summary ?? null,
  }));
}

/** Careers that currently have at least one live posting — for the hub links. */
export async function careerSlugsWithJobs(
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<Set<string>> {
  const today = now.toISOString().slice(0, 10);
  const rows = await database
    .selectDistinct({ slug: careers.slug })
    .from(jobPostings)
    .innerJoin(careers, eq(careers.id, jobPostings.careerId))
    .where(and(eq(jobPostings.status, 'published'), sql`${effectiveExpiry} >= ${today}`));

  return new Set(rows.map((row) => row.slug));
}
