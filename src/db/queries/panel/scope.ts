/**
 * The institution boundary, in one file (PR-21). CLAUDE.md rules 4 and 5.
 *
 * ### The bug this exists to make impossible
 *
 * `/panel/carreras/57` is a URL an institution user can edit. If the handler
 * loads program 57 and then filters *the list it renders* by the session's
 * institution, the read already happened — and the write that follows will
 * happen too. Filtering a query by `institutionId` is necessary and is not
 * sufficient: the id in the path is an **object reference**, and every object
 * reference has to be checked against the session before it is used.
 *
 * So every panel entry point resolves the owning institution of the row it was
 * handed and compares it to `scopeToInstitution(user)` — which, per
 * `architecture.md` §7.1, never coerces: an institution user asking for another
 * institution's id gets an `AuthError`, not their own id back quietly.
 *
 * ### Why the decision is split from the fetch
 *
 * `assertSameInstitution` is **pure**. That is what lets the cross-institution
 * cases be tested exhaustively without a database, and what lets the route-level
 * test stub the ownership lookup and still exercise the real rule
 * (`access.test.ts`). A boundary that can only be tested by standing up MySQL is
 * a boundary that stops being tested.
 */

import { and, eq } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import {
  accreditations,
  admissions,
  campuses,
  leads,
  offerings,
  prices,
  programs,
} from '@/db/schema';
import { AuthError, hasRole, isStaff, scopeToInstitution } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';

/** Roles allowed anywhere under `/panel`. Staff never reach it — they have `/admin`. */
export const PANEL_ROLES = ['institution_editor'] as const;
/** Member management and anything that changes who can log in. */
export const PANEL_ADMIN_ROLES = ['institution_admin'] as const;

/**
 * The institution this session may act on, and the only id that may reach a
 * WHERE clause.
 *
 * Staff are refused here rather than handed every institution: `/panel` renders
 * one institution's own data with "your" wording throughout, and a staff user
 * with no institution has no meaningful answer to "which one". They use
 * `/admin`, which asks explicitly.
 */
export function panelInstitutionId(user: SessionUser | null | undefined): number {
  if (!user) throw new AuthError('No hay sesión iniciada.', 'unauthenticated');
  if (isStaff(user)) {
    throw new AuthError('El panel es para instituciones. Usá /admin.', 'forbidden');
  }
  if (!hasRole(user, PANEL_ROLES)) {
    throw new AuthError('No tenés permiso para esto.', 'forbidden');
  }
  return scopeToInstitution(user);
}

/** `institution_admin` only — inviting a member changes who can sign in. */
export function requirePanelAdmin(user: SessionUser | null | undefined): number {
  const id = panelInstitutionId(user);
  if (!hasRole(user, PANEL_ADMIN_ROLES)) {
    throw new AuthError('Solo un administrador de la institución puede hacer esto.', 'forbidden');
  }
  return id;
}

/**
 * The whole rule, as a pure function.
 *
 * `owner` is null when the row does not exist. That is deliberately **not**
 * distinguished from "it exists and belongs to someone else": answering 404 for
 * one and 403 for the other turns the URL space into an oracle for which ids
 * are real. Both throw the same `forbidden`.
 */
export function assertSameInstitution(
  user: SessionUser | null | undefined,
  owner: number | null | undefined,
): number {
  const scope = panelInstitutionId(user);
  if (owner == null || owner !== scope) {
    throw new AuthError('No tenés permiso para acceder a ese registro.', 'forbidden');
  }
  return scope;
}

/* -------------------------------------------------------------------------- */
/* Ownership lookups — "which institution does this row belong to?"            */
/* -------------------------------------------------------------------------- */

export async function programInstitutionId(
  programId: number,
  database: Db = defaultDb,
): Promise<number | null> {
  const [row] = await database
    .select({ institutionId: programs.institutionId })
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1);
  return row?.institutionId ?? null;
}

export async function offeringInstitutionId(
  offeringId: number,
  database: Db = defaultDb,
): Promise<number | null> {
  const [row] = await database
    .select({ institutionId: programs.institutionId })
    .from(offerings)
    .innerJoin(programs, eq(programs.id, offerings.programId))
    .where(eq(offerings.id, offeringId))
    .limit(1);
  return row?.institutionId ?? null;
}

export async function priceInstitutionId(
  priceId: number,
  database: Db = defaultDb,
): Promise<number | null> {
  const [row] = await database
    .select({ institutionId: programs.institutionId })
    .from(prices)
    .innerJoin(offerings, eq(offerings.id, prices.offeringId))
    .innerJoin(programs, eq(programs.id, offerings.programId))
    .where(eq(prices.id, priceId))
    .limit(1);
  return row?.institutionId ?? null;
}

/**
 * Admissions are polymorphic, so the owner is whichever of the three targets is
 * set. An offering-scoped row resolves through its programme, exactly as the
 * accreditation badge's precedence does.
 */
export async function admissionInstitutionId(
  admissionId: number,
  database: Db = defaultDb,
): Promise<number | null> {
  const [row] = await database
    .select({
      institutionId: admissions.institutionId,
      programId: admissions.programId,
      offeringId: admissions.offeringId,
    })
    .from(admissions)
    .where(eq(admissions.id, admissionId))
    .limit(1);
  if (!row) return null;
  if (row.institutionId != null) return row.institutionId;
  if (row.programId != null) return programInstitutionId(row.programId, database);
  if (row.offeringId != null) return offeringInstitutionId(row.offeringId, database);
  return null;
}

/**
 * A lead carries `institution_id` directly — no join needed, unlike the
 * polymorphic admission/accreditation lookups above (PR-23).
 */
export async function leadInstitutionId(
  leadId: number,
  database: Db = defaultDb,
): Promise<number | null> {
  const [row] = await database
    .select({ institutionId: leads.institutionId })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  return row?.institutionId ?? null;
}

export async function campusInstitutionId(
  campusId: number,
  database: Db = defaultDb,
): Promise<number | null> {
  const [row] = await database
    .select({ institutionId: campuses.institutionId })
    .from(campuses)
    .where(eq(campuses.id, campusId))
    .limit(1);
  return row?.institutionId ?? null;
}

export async function accreditationInstitutionId(
  accreditationId: number,
  database: Db = defaultDb,
): Promise<number | null> {
  const [row] = await database
    .select({
      institutionId: accreditations.institutionId,
      programId: accreditations.programId,
      offeringId: accreditations.offeringId,
    })
    .from(accreditations)
    .where(eq(accreditations.id, accreditationId))
    .limit(1);
  if (!row) return null;
  if (row.institutionId != null) return row.institutionId;
  if (row.programId != null) return programInstitutionId(row.programId, database);
  if (row.offeringId != null) return offeringInstitutionId(row.offeringId, database);
  return null;
}

/* -------------------------------------------------------------------------- */
/* The guards route handlers actually call                                    */
/* -------------------------------------------------------------------------- */

export async function assertOwnsProgram(
  user: SessionUser | null | undefined,
  programId: number,
  database: Db = defaultDb,
): Promise<number> {
  return assertSameInstitution(user, await programInstitutionId(programId, database));
}

export async function assertOwnsOffering(
  user: SessionUser | null | undefined,
  offeringId: number,
  database: Db = defaultDb,
): Promise<number> {
  return assertSameInstitution(user, await offeringInstitutionId(offeringId, database));
}

export async function assertOwnsPrice(
  user: SessionUser | null | undefined,
  priceId: number,
  database: Db = defaultDb,
): Promise<number> {
  return assertSameInstitution(user, await priceInstitutionId(priceId, database));
}

export async function assertOwnsAdmission(
  user: SessionUser | null | undefined,
  admissionId: number,
  database: Db = defaultDb,
): Promise<number> {
  return assertSameInstitution(user, await admissionInstitutionId(admissionId, database));
}

export async function assertOwnsLead(
  user: SessionUser | null | undefined,
  leadId: number,
  database: Db = defaultDb,
): Promise<number> {
  return assertSameInstitution(user, await leadInstitutionId(leadId, database));
}

export async function assertOwnsCampus(
  user: SessionUser | null | undefined,
  campusId: number,
  database: Db = defaultDb,
): Promise<number> {
  return assertSameInstitution(user, await campusInstitutionId(campusId, database));
}

/**
 * An offering an institution is about to attach something to must be theirs
 * *and* the programme it belongs to must be theirs. Those are the same check
 * here because an offering's institution is resolved through its programme —
 * but stating it separately is what stops a future refactor from resolving the
 * offering through its campus instead, where a shared campus would open a hole.
 */
export async function assertOwnsOfferingForWrite(
  user: SessionUser | null | undefined,
  offeringId: number,
  database: Db = defaultDb,
): Promise<number> {
  const [row] = await database
    .select({ programId: offerings.programId, institutionId: programs.institutionId })
    .from(offerings)
    .innerJoin(programs, eq(programs.id, offerings.programId))
    .where(and(eq(offerings.id, offeringId)))
    .limit(1);
  return assertSameInstitution(user, row?.institutionId ?? null);
}
