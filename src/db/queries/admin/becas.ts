/**
 * Admin CRUD for becas (PR-31). Rule 5, PR-19 shape: `requireRole` inside every
 * mutation, `activity_log` in the same transaction, archive rather than delete.
 *
 * `verified_at` is stamped on every save, with the saving user — a beca is a
 * dated claim about someone else's money, and "who said this was still true,
 * and when" is the question that gets asked when it turns out not to be
 * (`architecture.md` §14.2 made the same argument for prices).
 *
 * No search-index rebuild: becas are not in `program_search`. PR-57 put the
 * public becas reads (`@/lib/becas`) behind the public-read cache, which means
 * every mutation below now has to expire it itself — `rebuildProgramSearch()`
 * was never in this file's path to begin with, so there is nothing to piggy
 * back on. Same reasoning, and the same call, as `admin/areas.ts`
 * (`cache/tags.ts` lists both).
 */

import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { becas } from '@/db/schema';
import { expirePublicReads } from '@/lib/cache';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { BecaInput } from '@/lib/admin/validation';
import { slugify } from '@/lib/curate';

import { logActivity } from './activity-log';
import type { AdminListPage } from './institutions';

export type BecaRow = typeof becas.$inferSelect;

const PAGE_SIZE = 25;

export async function listBecasAdmin(
  actor: SessionUser | null | undefined,
  options: { page?: number } = {},
  database: Db = defaultDb,
): Promise<AdminListPage<BecaRow>> {
  requireRole(actor, ['editor']);

  const page = Math.max(1, options.page ?? 1);
  const [rows, [{ count }]] = await Promise.all([
    database
      .select()
      .from(becas)
      .orderBy(sql`${becas.deadline} is null`, asc(becas.deadline), desc(becas.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    database.select({ count: sql<number>`count(*)` }).from(becas),
  ]);

  return { rows, total: Number(count), page, pageSize: PAGE_SIZE };
}

export async function getBecaForEdit(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<BecaRow | null> {
  requireRole(actor, ['editor']);
  const [row] = await database.select().from(becas).where(eq(becas.id, id)).limit(1);
  return row ?? null;
}

export async function isBecaSlugTaken(
  slug: string,
  excludeId: number | null,
  database: Db = defaultDb,
): Promise<boolean> {
  const where = excludeId
    ? and(eq(becas.slug, slug), ne(becas.id, excludeId))
    : eq(becas.slug, slug);
  const [row] = await database.select({ id: becas.id }).from(becas).where(where).limit(1);
  return Boolean(row);
}

function toRow(input: BecaInput, userId: number): typeof becas.$inferInsert {
  return {
    slug: input.slug ?? slugify(input.title),
    title: input.title,
    institutionId: input.institutionId,
    providerName: input.providerName,
    areaId: input.areaId,
    type: input.type,
    coverage: input.coverage,
    amountPyg: input.amountPyg,
    percentage: input.percentage,
    summary: input.summary,
    detailsMd: input.detailsMd,
    requirementsMd: input.requirementsMd,
    applyUrl: input.applyUrl,
    sourceUrl: input.sourceUrl,
    deadline: input.deadline,
    status: input.status,
    verifiedAt: new Date(),
    verifiedByUserId: userId,
  };
}

export async function createBeca(
  actor: SessionUser | null | undefined,
  input: BecaInput,
  database: Db = defaultDb,
): Promise<number> {
  const user = requireRole(actor, ['editor']);
  const row = toRow(input, user.id);

  const insertId = await database.transaction(async (tx) => {
    const [result] = await tx.insert(becas).values(row);
    const insertId = Number(result.insertId);
    await logActivity(tx, {
      userId: user.id,
      entityType: 'beca',
      entityId: insertId,
      action: 'create',
      before: null,
      after: { ...row },
    });
    return insertId;
  });

  // Outside the transaction on purpose (`admin/areas.ts` makes the same
  // argument): expiring after a write that then rolls back costs one cold read
  // of unchanged data, while not expiring after a write that committed is a
  // stale page.
  expirePublicReads();

  return insertId;
}

export async function updateBeca(
  actor: SessionUser | null | undefined,
  id: number,
  input: BecaInput,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(becas).where(eq(becas.id, id)).limit(1);
    if (!before) throw new Error('Beca no encontrada.');

    const row = { ...toRow(input, user.id), slug: input.slug ?? before.slug };
    await tx.update(becas).set(row).where(eq(becas.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'beca',
      entityId: id,
      action: 'update',
      before: { ...before },
      after: { ...before, ...row },
    });
  });

  // Outside the transaction — see `createBeca` above.
  expirePublicReads();
}

export async function archiveBeca(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(becas).where(eq(becas.id, id)).limit(1);
    if (!before) throw new Error('Beca no encontrada.');

    await tx.update(becas).set({ status: 'archived' }).where(eq(becas.id, id));
    await logActivity(tx, {
      userId: user.id,
      entityType: 'beca',
      entityId: id,
      action: 'archive',
      before: { status: before.status },
      after: { status: 'archived' },
    });
  });

  // Outside the transaction — see `createBeca` above.
  expirePublicReads();
}
