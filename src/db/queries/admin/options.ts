/**
 * Small lookup lists the admin forms populate `<select>`s from — institutions,
 * campuses (scoped to one institution), careers, cities, programs (scoped to
 * one institution). Read-only, unscoped by role: every staff user who can
 * reach `/admin` may see every institution's name to build a relationship
 * (an offering references a campus, a program references an institution).
 *
 * Kept separate from `institutions.ts` / `careers.ts` because those modules
 * serve the public site and return only `published` rows — an admin picking
 * a campus for a new offering needs to see `draft` ones too.
 */

import { asc, eq } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { areas, campuses, careers, cities, institutions, offerings, programs } from '@/db/schema';
import { MODALITY_LABELS, SHIFT_LABELS } from '@/lib/search/labels';

export interface Option {
  id: number;
  label: string;
}

export async function listAreaOptions(database: Db = defaultDb): Promise<Option[]> {
  const rows = await database
    .select({ id: areas.id, label: areas.nameEs })
    .from(areas)
    .orderBy(asc(areas.sortOrder), asc(areas.nameEs));
  return rows;
}

export async function listInstitutionOptions(database: Db = defaultDb): Promise<Option[]> {
  const rows = await database
    .select({ id: institutions.id, label: institutions.nameShort })
    .from(institutions)
    .orderBy(asc(institutions.nameShort));
  return rows;
}

export async function listCityOptions(database: Db = defaultDb): Promise<Option[]> {
  const rows = await database
    .select({ id: cities.id, label: cities.nameEs })
    .from(cities)
    .orderBy(asc(cities.nameEs));
  return rows;
}

export async function listCareerOptions(database: Db = defaultDb): Promise<Option[]> {
  const rows = await database
    .select({ id: careers.id, label: careers.nameEs })
    .from(careers)
    .orderBy(asc(careers.nameEs));
  return rows;
}

export async function listCampusOptions(
  institutionId: number,
  database: Db = defaultDb,
): Promise<Option[]> {
  const rows = await database
    .select({ id: campuses.id, label: campuses.name })
    .from(campuses)
    .where(eq(campuses.institutionId, institutionId))
    .orderBy(asc(campuses.name));
  return rows;
}

export async function listProgramOptions(
  institutionId: number,
  database: Db = defaultDb,
): Promise<Option[]> {
  const rows = await database
    .select({ id: programs.id, label: programs.nameOfficial })
    .from(programs)
    .where(eq(programs.institutionId, institutionId))
    .orderBy(asc(programs.nameOfficial));
  return rows;
}

/** Every campus, with the owning institution's name prefixed — for the offerings form, which needs a campus without first picking an institution. */
export async function listAllCampusOptions(database: Db = defaultDb): Promise<Option[]> {
  const rows = await database
    .select({
      id: campuses.id,
      institutionName: institutions.nameShort,
      campusName: campuses.name,
    })
    .from(campuses)
    .innerJoin(institutions, eq(campuses.institutionId, institutions.id))
    .orderBy(asc(institutions.nameShort), asc(campuses.name));
  return rows.map((row) => ({ id: row.id, label: `${row.institutionName} — ${row.campusName}` }));
}

/** Every program, with the owning institution's name prefixed — same reason as `listAllCampusOptions`. */
export async function listAllProgramOptions(database: Db = defaultDb): Promise<Option[]> {
  const rows = await database
    .select({
      id: programs.id,
      institutionName: institutions.nameShort,
      programName: programs.nameOfficial,
    })
    .from(programs)
    .innerJoin(institutions, eq(programs.institutionId, institutions.id))
    .orderBy(asc(institutions.nameShort), asc(programs.nameOfficial));
  return rows.map((row) => ({ id: row.id, label: `${row.institutionName} — ${row.programName}` }));
}

/**
 * Offerings for one institution, labelled the way a moderator identifies one:
 * programme, sede, modalidad, turno — the four things that make an offering
 * distinct (`offerings_uq`).
 *
 * Scoped to an institution on purpose. There are ~10 000 offerings nationally
 * and a `<select>` of all of them is not a control, so the forms that need one
 * (arancel, convocatoria, acreditación de alcance oferta) ask which institution
 * first and then show a list that fits on a screen.
 */
export async function listOfferingOptions(
  institutionId: number,
  database: Db = defaultDb,
): Promise<Option[]> {
  const rows = await database
    .select({
      id: offerings.id,
      programName: programs.nameOfficial,
      campusName: campuses.name,
      modality: offerings.modality,
      shift: offerings.shift,
    })
    .from(offerings)
    .innerJoin(programs, eq(programs.id, offerings.programId))
    .innerJoin(campuses, eq(campuses.id, offerings.campusId))
    .where(eq(programs.institutionId, institutionId))
    .orderBy(asc(programs.nameOfficial), asc(campuses.name));

  return rows.map((row) => ({
    id: row.id,
    label: `${row.programName} — ${row.campusName} · ${MODALITY_LABELS[row.modality]} · ${SHIFT_LABELS[row.shift]}`,
  }));
}
