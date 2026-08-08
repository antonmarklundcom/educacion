/**
 * Admin CRUD over the five core entities (CLAUDE.md rule 5 — all SQL here).
 *
 * This module **only** reads and writes. It holds no authorization: every entry
 * point is called from a server action that has already called `requireRole`,
 * and putting a second, weaker check here would invite someone to trust it.
 * It holds no field rules either — those are `src/lib/admin/entities.ts`, which
 * is pure and tested.
 *
 * ### Column allow-lists, not spread
 *
 * `writeEntity` picks the columns the registry declares rather than spreading
 * the parsed object. A parsed form is derived from a `FormData` an operator
 * controls; spreading it would make any future key a column write, which is the
 * same reasoning `curation.ts` already applies to importer proposals.
 *
 * ### Nothing is hard-deleted
 *
 * `archiveEntity` sets `status = 'archived'` (data-model.md §3). Inbound links
 * and Google's index outlive our opinion about a program.
 */

import { and, asc, count, eq, like, or, sql, type SQL } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { areas, campuses, careers, cities, institutions, offerings, programs } from '@/db/schema';
import type { AdminEntity, EntityDef, FieldValues, ReferenceKind } from '@/lib/admin/entities';
import { ENTITY_DEFS } from '@/lib/admin/entities';

/* -------------------------------------------------------------------------- */
/* Table plumbing                                                             */
/* -------------------------------------------------------------------------- */

const TABLES = {
  instituciones: institutions,
  sedes: campuses,
  carreras: careers,
  programas: programs,
  ofertas: offerings,
} as const;

/** Columns a free-text admin search may look at, per entity. */
const SEARCHABLE: Record<AdminEntity, readonly string[]> = {
  instituciones: ['nameOfficial', 'nameShort', 'acronym', 'slug'],
  sedes: ['name', 'slug', 'address'],
  carreras: ['nameEs', 'slug'],
  programas: ['nameOfficial', 'slug', 'titleAwarded'],
  ofertas: [],
};

function column(entity: AdminEntity, name: string) {
  const found = (TABLES[entity] as unknown as Record<string, unknown>)[name];
  if (!found) throw new Error(`Unknown column ${name} on ${entity}.`);
  return found as never;
}

/* -------------------------------------------------------------------------- */
/* Reference options                                                          */
/* -------------------------------------------------------------------------- */

export interface ReferenceOption {
  id: number;
  label: string;
  /** Set for campuses and programs so a form can narrow by institution. */
  institutionId?: number;
}

const REFERENCE_LIMIT = 2000;

/**
 * The `<select>` contents for every reference field a form uses, in one call.
 *
 * Bounded at 2000 rows per kind: the country has ~59 institutions, a few
 * hundred campuses and a few thousand programs, so this is a real bound rather
 * than a paging problem deferred. If a list ever hits it, the form needs a
 * search field, not a bigger number.
 */
export async function loadReferenceOptions(
  kinds: readonly ReferenceKind[],
  database: Db = defaultDb,
): Promise<Record<ReferenceKind, ReferenceOption[]>> {
  const out: Record<ReferenceKind, ReferenceOption[]> = {
    institution: [],
    campus: [],
    career: [],
    area: [],
    city: [],
    program: [],
  };
  const wanted = new Set(kinds);

  await Promise.all([
    wanted.has('institution')
      ? database
          .select({ id: institutions.id, label: institutions.nameOfficial })
          .from(institutions)
          .orderBy(asc(institutions.nameOfficial))
          .limit(REFERENCE_LIMIT)
          .then((rows) => {
            out.institution = rows;
          })
      : null,
    wanted.has('campus')
      ? database
          .select({
            id: campuses.id,
            label: sql<string>`concat(${institutions.nameShort}, ' — ', ${campuses.name})`,
            institutionId: campuses.institutionId,
          })
          .from(campuses)
          .innerJoin(institutions, eq(institutions.id, campuses.institutionId))
          .orderBy(asc(institutions.nameShort), asc(campuses.name))
          .limit(REFERENCE_LIMIT)
          .then((rows) => {
            out.campus = rows;
          })
      : null,
    wanted.has('career')
      ? database
          .select({ id: careers.id, label: careers.nameEs })
          .from(careers)
          .orderBy(asc(careers.nameEs))
          .limit(REFERENCE_LIMIT)
          .then((rows) => {
            out.career = rows;
          })
      : null,
    wanted.has('area')
      ? database
          .select({ id: areas.id, label: areas.nameEs })
          .from(areas)
          .orderBy(asc(areas.sortOrder), asc(areas.nameEs))
          .limit(REFERENCE_LIMIT)
          .then((rows) => {
            out.area = rows;
          })
      : null,
    wanted.has('city')
      ? database
          .select({ id: cities.id, label: cities.nameEs })
          .from(cities)
          .orderBy(asc(cities.nameEs))
          .limit(REFERENCE_LIMIT)
          .then((rows) => {
            out.city = rows;
          })
      : null,
    wanted.has('program')
      ? database
          .select({
            id: programs.id,
            label: sql<string>`concat(${institutions.nameShort}, ' — ', ${programs.nameOfficial})`,
            institutionId: programs.institutionId,
          })
          .from(programs)
          .innerJoin(institutions, eq(institutions.id, programs.institutionId))
          .orderBy(asc(institutions.nameShort), asc(programs.nameOfficial))
          .limit(REFERENCE_LIMIT)
          .then((rows) => {
            out.program = rows;
          })
      : null,
  ]);

  return out;
}

/** Every reference kind the form for `def` needs, deduplicated. */
export function referenceKindsFor(def: EntityDef): ReferenceKind[] {
  const kinds = new Set<ReferenceKind>();
  for (const field of def.fields) if (field.reference) kinds.add(field.reference);
  if (def.listFilter) kinds.add(def.listFilter.reference);
  return [...kinds];
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export interface EntityListQuery {
  q?: string;
  filterValue?: number | null;
  page?: number;
  perPage?: number;
}

export interface EntityListPage {
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  perPage: number;
}

export async function listEntities(
  entity: AdminEntity,
  query: EntityListQuery = {},
  database: Db = defaultDb,
): Promise<EntityListPage> {
  const def = ENTITY_DEFS[entity];
  const table = TABLES[entity];
  const perPage = Math.min(Math.max(query.perPage ?? 50, 1), 200);
  const page = Math.max(query.page ?? 1, 1);

  const conditions: SQL[] = [];
  const term = query.q?.trim();
  if (term) {
    const columns = SEARCHABLE[entity];
    const likes = columns.map((name) => like(column(entity, name), `%${term}%`));
    if (likes.length) conditions.push(or(...likes)!);
  }
  if (query.filterValue != null && def.listFilter) {
    conditions.push(eq(column(entity, def.listFilter.field), query.filterValue));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const orderColumn = def.listColumns.includes(def.titleField)
    ? column(entity, def.titleField)
    : (table as unknown as { id: never }).id;

  const [rows, [totals]] = await Promise.all([
    database
      .select()
      .from(table)
      .where(where)
      .orderBy(asc(orderColumn))
      .limit(perPage)
      .offset((page - 1) * perPage),
    database.select({ value: count() }).from(table).where(where),
  ]);

  return {
    rows: rows as Array<Record<string, unknown>>,
    total: Number(totals?.value ?? 0),
    page,
    perPage,
  };
}

export async function readEntity(
  entity: AdminEntity,
  id: number,
  database: Db = defaultDb,
): Promise<Record<string, unknown> | null> {
  const table = TABLES[entity];
  const rows = await database
    .select()
    .from(table)
    .where(eq((table as unknown as { id: never }).id, id as never))
    .limit(1);
  return (rows[0] as Record<string, unknown> | undefined) ?? null;
}

/** The most recently touched rows, for the admin dashboard. */
export async function countEntities(
  database: Db = defaultDb,
): Promise<Record<AdminEntity, number>> {
  const entries = await Promise.all(
    (Object.keys(TABLES) as AdminEntity[]).map(async (entity) => {
      const [row] = await database.select({ value: count() }).from(TABLES[entity]);
      return [entity, Number(row?.value ?? 0)] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<AdminEntity, number>;
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/** The columns the registry declares, plus the derived ones it owns. */
function writableColumns(def: EntityDef): string[] {
  const names = def.fields.filter((field) => !field.readOnly).map((field) => field.name);
  if (def.table === 'institution' || def.table === 'program') names.push('matchKey');
  return names;
}

function pickColumns(def: EntityDef, values: FieldValues): Record<string, unknown> {
  const allowed = new Set(writableColumns(def));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (allowed.has(key)) out[key] = value;
  }
  return out;
}

export async function createEntity(
  entity: AdminEntity,
  values: FieldValues,
  database: Db = defaultDb,
): Promise<number> {
  const def = ENTITY_DEFS[entity];
  const row = pickColumns(def, values);
  const [result] = await database.insert(TABLES[entity]).values(row as never);
  return Number(result.insertId);
}

export async function updateEntity(
  entity: AdminEntity,
  id: number,
  values: FieldValues,
  database: Db = defaultDb,
): Promise<void> {
  const def = ENTITY_DEFS[entity];
  const row = pickColumns(def, values);
  if (Object.keys(row).length === 0) return;
  const table = TABLES[entity];
  await database
    .update(table)
    .set(row as never)
    .where(eq((table as unknown as { id: never }).id, id as never));
}

/** Soft delete. Restoring is the same call with `'draft'`. */
export async function setEntityStatus(
  entity: AdminEntity,
  id: number,
  status: 'draft' | 'published' | 'archived',
  database: Db = defaultDb,
): Promise<void> {
  const table = TABLES[entity];
  await database
    .update(table)
    .set({ status } as never)
    .where(eq((table as unknown as { id: never }).id, id as never));
}

/** Set an institution's logo to the URL the storage adapter returned. */
export async function setInstitutionLogo(
  id: number,
  logoUrl: string | null,
  database: Db = defaultDb,
): Promise<void> {
  await database.update(institutions).set({ logoUrl }).where(eq(institutions.id, id));
}

export async function readInstitutionSlug(
  id: number,
  database: Db = defaultDb,
): Promise<string | null> {
  const rows = await database
    .select({ slug: institutions.slug })
    .from(institutions)
    .where(eq(institutions.id, id))
    .limit(1);
  return rows[0]?.slug ?? null;
}
