/**
 * Admin CRUD for `institutions` (PR-19). CLAUDE.md rule 5: all SQL lives
 * here; `src/app/admin/instituciones/*` only calls these functions with a
 * `SessionUser` and plain objects.
 *
 * **`requireRole` is called inside every mutation, not just in the calling
 * server action.** A server action is reachable directly — Next.js does not
 * re-run the `/admin` layout guard for it — so the boundary that actually
 * matters is this module. `createInstitution`, `updateInstitution` and
 * `archiveInstitution` throw `AuthError` before touching the database when
 * `actor` does not satisfy `['editor']`, which is also what makes them
 * testable without a browser (`institutions.test.ts`).
 *
 * **Every write logs `activity_log` and rebuilds `program_search`.** Both
 * happen inside the same function as the mutation, in that order, so a
 * caller cannot reach one without the other.
 *
 * **`match_key` is never a form field.** It is derived from `nameOfficial`
 * with the same `buildMatchKey` the import pipeline uses (`data-sources.md`
 * §4), so an institution created here matches the same way one created by
 * `curate` would. Accreditation is not writable from this module at all —
 * that is PR-20's, and CLAUDE.md rule 1 forbids inventing it here anyway.
 */

import { and, asc, eq, like, ne, or, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { institutions } from '@/db/schema';
import { buildMatchKey, uniqueSlug } from '@/lib/curate';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { InstitutionInput } from '@/lib/admin/validation';

import { logActivity } from './activity-log';
import { rebuildProgramSearch } from '../rebuild-search';

export type InstitutionRow = typeof institutions.$inferSelect;

export interface AdminListPage<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 25;

export async function listInstitutionsAdmin(
  actor: SessionUser | null | undefined,
  options: { q?: string; page?: number } = {},
  database: Db = defaultDb,
): Promise<AdminListPage<InstitutionRow>> {
  requireRole(actor, ['editor']);

  const page = Math.max(1, options.page ?? 1);
  const q = options.q?.trim();
  const where = q
    ? or(like(institutions.nameOfficial, `%${q}%`), like(institutions.nameShort, `%${q}%`))
    : undefined;

  const [rows, [{ count }]] = await Promise.all([
    database
      .select()
      .from(institutions)
      .where(where)
      .orderBy(asc(institutions.nameShort))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    database
      .select({ count: sql<number>`count(*)` })
      .from(institutions)
      .where(where),
  ]);

  return { rows, total: Number(count), page, pageSize: PAGE_SIZE };
}

export async function getInstitutionForEdit(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<InstitutionRow | null> {
  requireRole(actor, ['editor']);
  const [row] = await database.select().from(institutions).where(eq(institutions.id, id)).limit(1);
  return row ?? null;
}

async function existingSlugs(database: Db): Promise<Set<string>> {
  const rows = await database.select({ slug: institutions.slug }).from(institutions);
  return new Set(rows.map((r) => r.slug));
}

export async function createInstitution(
  actor: SessionUser | null | undefined,
  input: InstitutionInput,
  database: Db = defaultDb,
): Promise<number> {
  const user = requireRole(actor, ['editor']);

  const slug = input.slug ?? uniqueSlug(input.nameOfficial, await existingSlugs(database));
  const row: typeof institutions.$inferInsert = {
    slug,
    nameOfficial: input.nameOfficial,
    nameShort: input.nameShort,
    acronym: input.acronym,
    matchKey: buildMatchKey(input.nameOfficial),
    management: input.management,
    type: input.type,
    conesCode: input.conesCode,
    foundedYear: input.foundedYear,
    website: input.website,
    email: input.email,
    phoneE164: input.phoneE164,
    whatsappE164: input.whatsappE164,
    brandColor: input.brandColor,
    descriptionMd: input.descriptionMd,
    status: input.status,
  };

  const id = await database.transaction(async (tx) => {
    const [result] = await tx.insert(institutions).values(row);
    const insertId = Number(result.insertId);
    await logActivity(tx, {
      userId: user.id,
      entityType: 'institution',
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

/** Sets `logo_url` alone, after a successful upload. Logged like any other update. */
export async function setInstitutionLogo(
  actor: SessionUser | null | undefined,
  id: number,
  logoUrl: string,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(institutions).where(eq(institutions.id, id)).limit(1);
    if (!before) throw new Error('Institución no encontrada.');

    await tx.update(institutions).set({ logoUrl }).where(eq(institutions.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'institution',
      entityId: id,
      action: 'update',
      before: { logoUrl: before.logoUrl },
      after: { logoUrl },
    });
  });

  await rebuildProgramSearch({ db: database });
}

export async function updateInstitution(
  actor: SessionUser | null | undefined,
  id: number,
  input: InstitutionInput,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(institutions).where(eq(institutions.id, id)).limit(1);
    if (!before) throw new Error('Institución no encontrada.');

    const row: Partial<typeof institutions.$inferInsert> = {
      slug: input.slug ?? before.slug,
      nameOfficial: input.nameOfficial,
      nameShort: input.nameShort,
      acronym: input.acronym,
      matchKey: buildMatchKey(input.nameOfficial),
      management: input.management,
      type: input.type,
      conesCode: input.conesCode,
      foundedYear: input.foundedYear,
      website: input.website,
      email: input.email,
      phoneE164: input.phoneE164,
      whatsappE164: input.whatsappE164,
      brandColor: input.brandColor,
      descriptionMd: input.descriptionMd,
      status: input.status,
    };

    await tx.update(institutions).set(row).where(eq(institutions.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'institution',
      entityId: id,
      action: 'update',
      before: { ...before },
      after: { ...before, ...row },
    });
  });

  await rebuildProgramSearch({ db: database });
}

/**
 * "Eliminá" archives, it never hard-deletes (data-model.md §3 — an
 * institution never disappears, inbound links and Google's index outlive our
 * opinions). A second archive on an already-archived row is a no-op logged
 * the same as any other update.
 */
export async function archiveInstitution(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(institutions).where(eq(institutions.id, id)).limit(1);
    if (!before) throw new Error('Institución no encontrada.');

    await tx.update(institutions).set({ status: 'archived' }).where(eq(institutions.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'institution',
      entityId: id,
      action: 'archive',
      before: { status: before.status },
      after: { status: 'archived' },
    });
  });

  await rebuildProgramSearch({ db: database });
}

/** True when `slug` is free, or belongs to `excludeId` (editing itself). */
export async function isInstitutionSlugTaken(
  slug: string,
  excludeId: number | null,
  database: Db = defaultDb,
): Promise<boolean> {
  const where = excludeId
    ? and(eq(institutions.slug, slug), ne(institutions.id, excludeId))
    : eq(institutions.slug, slug);
  const [row] = await database
    .select({ id: institutions.id })
    .from(institutions)
    .where(where)
    .limit(1);
  return Boolean(row);
}
