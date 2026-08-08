/**
 * Admin CRUD for `campuses` (PR-19). Same shape as `institutions.ts`:
 * `requireRole` inside every mutation, `activity_log` and a search-index
 * rebuild inside the same function as the write. See that file's header for
 * the reasoning — it is not repeated here.
 */

import { and, asc, eq, like, ne, or, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { campuses, cities, institutions } from '@/db/schema';
import { uniqueSlug } from '@/lib/curate';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { CampusInput } from '@/lib/admin/validation';

import { logActivity } from './activity-log';
import { rebuildProgramSearch } from '../rebuild-search';
import type { AdminListPage } from './institutions';

export interface CampusRow {
  id: number;
  institutionId: number;
  institutionName: string;
  name: string;
  slug: string;
  cityId: number;
  cityName: string;
  address: string | null;
  phoneE164: string | null;
  isMain: boolean;
  status: 'draft' | 'published' | 'archived';
}

const PAGE_SIZE = 25;

const SELECT_COLUMNS = {
  id: campuses.id,
  institutionId: campuses.institutionId,
  institutionName: institutions.nameShort,
  name: campuses.name,
  slug: campuses.slug,
  cityId: campuses.cityId,
  cityName: cities.nameEs,
  address: campuses.address,
  phoneE164: campuses.phoneE164,
  isMain: campuses.isMain,
  status: campuses.status,
} as const;

export async function listCampusesAdmin(
  actor: SessionUser | null | undefined,
  options: { q?: string; page?: number } = {},
  database: Db = defaultDb,
): Promise<AdminListPage<CampusRow>> {
  requireRole(actor, ['editor']);

  const page = Math.max(1, options.page ?? 1);
  const q = options.q?.trim();
  const where = q
    ? or(like(campuses.name, `%${q}%`), like(institutions.nameShort, `%${q}%`))
    : undefined;

  const base = () =>
    database
      .select(SELECT_COLUMNS)
      .from(campuses)
      .innerJoin(institutions, eq(campuses.institutionId, institutions.id))
      .innerJoin(cities, eq(campuses.cityId, cities.id))
      .where(where);

  const [rows, [{ count }]] = await Promise.all([
    base().orderBy(asc(institutions.nameShort), asc(campuses.name)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    database
      .select({ count: sql<number>`count(*)` })
      .from(campuses)
      .innerJoin(institutions, eq(campuses.institutionId, institutions.id))
      .where(where),
  ]);

  return { rows, total: Number(count), page, pageSize: PAGE_SIZE };
}

export async function getCampusForEdit(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<typeof campuses.$inferSelect | null> {
  requireRole(actor, ['editor']);
  const [row] = await database.select().from(campuses).where(eq(campuses.id, id)).limit(1);
  return row ?? null;
}

async function existingSlugs(database: Db, institutionId: number): Promise<Set<string>> {
  const rows = await database
    .select({ slug: campuses.slug })
    .from(campuses)
    .where(eq(campuses.institutionId, institutionId));
  return new Set(rows.map((r) => r.slug));
}

export async function createCampus(
  actor: SessionUser | null | undefined,
  input: CampusInput,
  database: Db = defaultDb,
): Promise<number> {
  const user = requireRole(actor, ['editor']);

  const slug = input.slug ?? uniqueSlug(input.name, await existingSlugs(database, input.institutionId));
  const row: typeof campuses.$inferInsert = {
    institutionId: input.institutionId,
    name: input.name,
    slug,
    cityId: input.cityId,
    address: input.address,
    phoneE164: input.phoneE164,
    isMain: input.isMain,
    status: input.status,
  };

  const id = await database.transaction(async (tx) => {
    const [result] = await tx.insert(campuses).values(row);
    const insertId = Number(result.insertId);
    await logActivity(tx, {
      userId: user.id,
      entityType: 'campus',
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

export async function updateCampus(
  actor: SessionUser | null | undefined,
  id: number,
  input: CampusInput,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(campuses).where(eq(campuses.id, id)).limit(1);
    if (!before) throw new Error('Sede no encontrada.');

    const row: Partial<typeof campuses.$inferInsert> = {
      institutionId: input.institutionId,
      name: input.name,
      slug: input.slug ?? before.slug,
      cityId: input.cityId,
      address: input.address,
      phoneE164: input.phoneE164,
      isMain: input.isMain,
      status: input.status,
    };

    await tx.update(campuses).set(row).where(eq(campuses.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'campus',
      entityId: id,
      action: 'update',
      before: { ...before },
      after: { ...before, ...row },
    });
  });

  await rebuildProgramSearch({ db: database });
}

export async function archiveCampus(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(campuses).where(eq(campuses.id, id)).limit(1);
    if (!before) throw new Error('Sede no encontrada.');

    await tx.update(campuses).set({ status: 'archived' }).where(eq(campuses.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'campus',
      entityId: id,
      action: 'archive',
      before: { status: before.status },
      after: { status: 'archived' },
    });
  });

  await rebuildProgramSearch({ db: database });
}

export async function isCampusSlugTaken(
  institutionId: number,
  slug: string,
  excludeId: number | null,
  database: Db = defaultDb,
): Promise<boolean> {
  const where = excludeId
    ? and(eq(campuses.institutionId, institutionId), eq(campuses.slug, slug), ne(campuses.id, excludeId))
    : and(eq(campuses.institutionId, institutionId), eq(campuses.slug, slug));
  const [row] = await database.select({ id: campuses.id }).from(campuses).where(where).limit(1);
  return Boolean(row);
}
