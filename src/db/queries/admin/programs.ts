/**
 * Admin CRUD for `programs` (PR-19). Same shape as `institutions.ts`.
 *
 * `matchKey` is derived from `nameOfficial` with `buildCareerMatchKey` — the
 * same function the curation pipeline uses for programs — and is never a
 * form field, for the same reason `institutions.ts` keeps it out of the form.
 */

import { and, asc, eq, like, ne, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { institutions, programs } from '@/db/schema';
import { buildCareerMatchKey, uniqueSlug } from '@/lib/curate';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { ProgramInput } from '@/lib/admin/validation';

import { logActivity } from './activity-log';
import { rebuildProgramSearch } from '../rebuild-search';
import type { AdminListPage } from './institutions';

export interface ProgramRow {
  id: number;
  institutionId: number;
  institutionName: string;
  careerId: number | null;
  nameOfficial: string;
  slug: string;
  level: (typeof programs.$inferSelect)['level'];
  titleAwarded: string | null;
  status: (typeof programs.$inferSelect)['status'];
}

const PAGE_SIZE = 25;

const SELECT_COLUMNS = {
  id: programs.id,
  institutionId: programs.institutionId,
  institutionName: institutions.nameShort,
  careerId: programs.careerId,
  nameOfficial: programs.nameOfficial,
  slug: programs.slug,
  level: programs.level,
  titleAwarded: programs.titleAwarded,
  status: programs.status,
} as const;

export async function listProgramsAdmin(
  actor: SessionUser | null | undefined,
  options: { q?: string; page?: number } = {},
  database: Db = defaultDb,
): Promise<AdminListPage<ProgramRow>> {
  requireRole(actor, ['editor']);

  const page = Math.max(1, options.page ?? 1);
  const q = options.q?.trim();
  const where = q ? like(programs.nameOfficial, `%${q}%`) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    database
      .select(SELECT_COLUMNS)
      .from(programs)
      .innerJoin(institutions, eq(programs.institutionId, institutions.id))
      .where(where)
      .orderBy(asc(institutions.nameShort), asc(programs.nameOfficial))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    database.select({ count: sql<number>`count(*)` }).from(programs).where(where),
  ]);

  return { rows, total: Number(count), page, pageSize: PAGE_SIZE };
}

export async function getProgramForEdit(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<typeof programs.$inferSelect | null> {
  requireRole(actor, ['editor']);
  const [row] = await database.select().from(programs).where(eq(programs.id, id)).limit(1);
  return row ?? null;
}

async function existingSlugs(database: Db, institutionId: number): Promise<Set<string>> {
  const rows = await database
    .select({ slug: programs.slug })
    .from(programs)
    .where(eq(programs.institutionId, institutionId));
  return new Set(rows.map((r) => r.slug));
}

export async function createProgram(
  actor: SessionUser | null | undefined,
  input: ProgramInput,
  database: Db = defaultDb,
): Promise<number> {
  const user = requireRole(actor, ['editor']);

  const slug =
    input.slug ?? uniqueSlug(input.nameOfficial, await existingSlugs(database, input.institutionId));
  const row: typeof programs.$inferInsert = {
    institutionId: input.institutionId,
    careerId: input.careerId,
    nameOfficial: input.nameOfficial,
    slug,
    matchKey: buildCareerMatchKey(input.nameOfficial),
    level: input.level,
    titleAwarded: input.titleAwarded,
    descriptionMd: input.descriptionMd,
    conesResolution: input.conesResolution,
    status: input.status,
  };

  const id = await database.transaction(async (tx) => {
    const [result] = await tx.insert(programs).values(row);
    const insertId = Number(result.insertId);
    await logActivity(tx, {
      userId: user.id,
      entityType: 'program',
      entityId: insertId,
      action: 'create',
      before: null,
      after: { ...row },
    });
    return insertId;
  });

  await rebuildProgramSearch({ db: database });
  return id;
}

export async function updateProgram(
  actor: SessionUser | null | undefined,
  id: number,
  input: ProgramInput,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(programs).where(eq(programs.id, id)).limit(1);
    if (!before) throw new Error('Programa no encontrado.');

    const row: Partial<typeof programs.$inferInsert> = {
      institutionId: input.institutionId,
      careerId: input.careerId,
      nameOfficial: input.nameOfficial,
      slug: input.slug ?? before.slug,
      matchKey: buildCareerMatchKey(input.nameOfficial),
      level: input.level,
      titleAwarded: input.titleAwarded,
      descriptionMd: input.descriptionMd,
      conesResolution: input.conesResolution,
      status: input.status,
    };

    await tx.update(programs).set(row).where(eq(programs.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'program',
      entityId: id,
      action: 'update',
      before: { ...before },
      after: { ...before, ...row },
    });
  });

  await rebuildProgramSearch({ db: database });
}

/** Programs are never hard-deleted (data-model.md §3) — archive only. */
export async function archiveProgram(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(programs).where(eq(programs.id, id)).limit(1);
    if (!before) throw new Error('Programa no encontrado.');

    await tx.update(programs).set({ status: 'archived' }).where(eq(programs.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'program',
      entityId: id,
      action: 'archive',
      before: { status: before.status },
      after: { status: 'archived' },
    });
  });

  await rebuildProgramSearch({ db: database });
}

export async function isProgramSlugTaken(
  institutionId: number,
  slug: string,
  excludeId: number | null,
  database: Db = defaultDb,
): Promise<boolean> {
  const where = excludeId
    ? and(eq(programs.institutionId, institutionId), eq(programs.slug, slug), ne(programs.id, excludeId))
    : and(eq(programs.institutionId, institutionId), eq(programs.slug, slug));
  const [row] = await database.select({ id: programs.id }).from(programs).where(where).limit(1);
  return Boolean(row);
}
