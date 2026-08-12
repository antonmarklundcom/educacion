/**
 * Admin CRUD for job postings (PR-32). Rule 5, PR-19 shape.
 *
 * **There is no scraper, and that is a decision.** `pr-plan.md` allowed
 * "scraped with attribution or a light integration"; scraping a Paraguayan job
 * board without an agreement is a terms-of-service question we would be
 * answering on somebody else's behalf, plus a parser to maintain against a site
 * we do not control. What ships is the storage, the attribution and the entry
 * form — a handful of curated postings per carrera is what the landing page
 * needs, and an integration can fill the same table later without changing a
 * line of the page. `architecture.md` §22 records it.
 */

import { and, desc, eq, ne, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { careers, jobPostings } from '@/db/schema';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { JobPostingInput } from '@/lib/admin/validation';

import { logActivity } from './activity-log';
import type { AdminListPage } from './institutions';

export interface AdminJobRow {
  id: number;
  title: string;
  employerName: string;
  careerName: string;
  postedOn: string;
  expiresOn: string | null;
  sourceLabel: string;
  status: 'draft' | 'published' | 'archived';
}

const PAGE_SIZE = 25;

export async function listJobsAdmin(
  actor: SessionUser | null | undefined,
  options: { page?: number } = {},
  database: Db = defaultDb,
): Promise<AdminListPage<AdminJobRow>> {
  requireRole(actor, ['editor']);
  const page = Math.max(1, options.page ?? 1);

  const [rows, [{ count }]] = await Promise.all([
    database
      .select({
        id: jobPostings.id,
        title: jobPostings.title,
        employerName: jobPostings.employerName,
        careerName: careers.nameEs,
        postedOn: jobPostings.postedOn,
        expiresOn: jobPostings.expiresOn,
        sourceLabel: jobPostings.sourceLabel,
        status: jobPostings.status,
      })
      .from(jobPostings)
      .innerJoin(careers, eq(careers.id, jobPostings.careerId))
      .orderBy(desc(jobPostings.postedOn), desc(jobPostings.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    database.select({ count: sql<number>`count(*)` }).from(jobPostings),
  ]);

  return {
    rows: rows.map((row) => ({ ...row, expiresOn: row.expiresOn ?? null })),
    total: Number(count),
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function getJobForEdit(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<typeof jobPostings.$inferSelect | null> {
  requireRole(actor, ['editor']);
  const [row] = await database.select().from(jobPostings).where(eq(jobPostings.id, id)).limit(1);
  return row ?? null;
}

/** The UNIQUE on `url` is what stops the same vacancy being listed twice. */
export async function isJobUrlTaken(
  url: string,
  excludeId: number | null,
  database: Db = defaultDb,
): Promise<boolean> {
  const where = excludeId
    ? and(eq(jobPostings.url, url), ne(jobPostings.id, excludeId))
    : eq(jobPostings.url, url);
  const [row] = await database
    .select({ id: jobPostings.id })
    .from(jobPostings)
    .where(where)
    .limit(1);
  return Boolean(row);
}

function toRow(input: JobPostingInput): typeof jobPostings.$inferInsert {
  return {
    careerId: input.careerId,
    title: input.title,
    employerName: input.employerName,
    locationLabel: input.locationLabel,
    url: input.url,
    source: input.source,
    sourceLabel: input.sourceLabel,
    postedOn: input.postedOn,
    expiresOn: input.expiresOn,
    summary: input.summary,
    status: input.status,
  };
}

export async function createJobPosting(
  actor: SessionUser | null | undefined,
  input: JobPostingInput,
  database: Db = defaultDb,
): Promise<number> {
  const user = requireRole(actor, ['editor']);
  const row = toRow(input);

  return database.transaction(async (tx) => {
    const [result] = await tx.insert(jobPostings).values(row);
    const insertId = Number(result.insertId);
    await logActivity(tx, {
      userId: user.id,
      entityType: 'job_posting',
      entityId: insertId,
      action: 'create',
      before: null,
      after: { ...row },
    });
    return insertId;
  });
}

export async function updateJobPosting(
  actor: SessionUser | null | undefined,
  id: number,
  input: JobPostingInput,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(jobPostings).where(eq(jobPostings.id, id)).limit(1);
    if (!before) throw new Error('Aviso no encontrado.');

    const row = toRow(input);
    await tx.update(jobPostings).set(row).where(eq(jobPostings.id, id));
    await logActivity(tx, {
      userId: user.id,
      entityType: 'job_posting',
      entityId: id,
      action: 'update',
      before: { ...before },
      after: { ...before, ...row },
    });
  });
}

export async function archiveJobPosting(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(jobPostings).where(eq(jobPostings.id, id)).limit(1);
    if (!before) throw new Error('Aviso no encontrado.');

    await tx.update(jobPostings).set({ status: 'archived' }).where(eq(jobPostings.id, id));
    await logActivity(tx, {
      userId: user.id,
      entityType: 'job_posting',
      entityId: id,
      action: 'archive',
      before: { status: before.status },
      after: { status: 'archived' },
    });
  });
}
