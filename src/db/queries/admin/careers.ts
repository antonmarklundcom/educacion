/**
 * Admin CRUD for `careers` (PR-19). Same shape as `institutions.ts`.
 *
 * `salidaLaboralMd` is free text an editor writes by hand — nothing here
 * generates or infers it, per `risks.md` §R-11 (no fabricated salary/
 * employability claims).
 */

import { asc, eq, like, ne, and, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { careers } from '@/db/schema';
import { uniqueSlug } from '@/lib/curate';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { CareerInput } from '@/lib/admin/validation';

import { logActivity } from './activity-log';
import { rebuildProgramSearch } from '../rebuild-search';
import type { AdminListPage } from './institutions';

export type CareerRow = typeof careers.$inferSelect;

const PAGE_SIZE = 25;

export async function listCareersAdmin(
  actor: SessionUser | null | undefined,
  options: { q?: string; page?: number } = {},
  database: Db = defaultDb,
): Promise<AdminListPage<CareerRow>> {
  requireRole(actor, ['editor']);

  const page = Math.max(1, options.page ?? 1);
  const q = options.q?.trim();
  const where = q ? like(careers.nameEs, `%${q}%`) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    database
      .select()
      .from(careers)
      .where(where)
      .orderBy(asc(careers.nameEs))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    database
      .select({ count: sql<number>`count(*)` })
      .from(careers)
      .where(where),
  ]);

  return { rows, total: Number(count), page, pageSize: PAGE_SIZE };
}

export async function getCareerForEdit(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<CareerRow | null> {
  requireRole(actor, ['editor']);
  const [row] = await database.select().from(careers).where(eq(careers.id, id)).limit(1);
  return row ?? null;
}

async function existingSlugs(database: Db): Promise<Set<string>> {
  const rows = await database.select({ slug: careers.slug }).from(careers);
  return new Set(rows.map((r) => r.slug));
}

export async function createCareer(
  actor: SessionUser | null | undefined,
  input: CareerInput,
  database: Db = defaultDb,
): Promise<number> {
  const user = requireRole(actor, ['editor']);

  const slug = input.slug ?? uniqueSlug(input.nameEs, await existingSlugs(database));
  const row: typeof careers.$inferInsert = {
    slug,
    nameEs: input.nameEs,
    areaId: input.areaId,
    levelDefault: input.levelDefault,
    synonymsJson: input.synonyms,
    descriptionMd: input.descriptionMd,
    salidaLaboralMd: input.salidaLaboralMd,
    status: input.status,
  };

  const id = await database.transaction(async (tx) => {
    const [result] = await tx.insert(careers).values(row);
    const insertId = Number(result.insertId);
    await logActivity(tx, {
      userId: user.id,
      entityType: 'career',
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

export async function updateCareer(
  actor: SessionUser | null | undefined,
  id: number,
  input: CareerInput,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(careers).where(eq(careers.id, id)).limit(1);
    if (!before) throw new Error('Carrera no encontrada.');

    const row: Partial<typeof careers.$inferInsert> = {
      slug: input.slug ?? before.slug,
      nameEs: input.nameEs,
      areaId: input.areaId,
      levelDefault: input.levelDefault,
      synonymsJson: input.synonyms,
      descriptionMd: input.descriptionMd,
      salidaLaboralMd: input.salidaLaboralMd,
      status: input.status,
    };

    await tx.update(careers).set(row).where(eq(careers.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'career',
      entityId: id,
      action: 'update',
      before: { ...before },
      after: { ...before, ...row },
    });
  });

  await rebuildProgramSearch({ db: database });
}

export async function archiveCareer(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(careers).where(eq(careers.id, id)).limit(1);
    if (!before) throw new Error('Carrera no encontrada.');

    await tx.update(careers).set({ status: 'archived' }).where(eq(careers.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'career',
      entityId: id,
      action: 'archive',
      before: { status: before.status },
      after: { status: 'archived' },
    });
  });

  await rebuildProgramSearch({ db: database });
}

export async function isCareerSlugTaken(
  slug: string,
  excludeId: number | null,
  database: Db = defaultDb,
): Promise<boolean> {
  const where = excludeId
    ? and(eq(careers.slug, slug), ne(careers.id, excludeId))
    : eq(careers.slug, slug);
  const [row] = await database.select({ id: careers.id }).from(careers).where(where).limit(1);
  return Boolean(row);
}
