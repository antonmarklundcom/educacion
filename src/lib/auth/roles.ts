/**
 * Authorization: `requireRole` and `scopeToInstitution`.
 *
 * These two functions are the interface PR-19 (admin CRUD), PR-20 (the
 * moderation queue) and PR-21 (`/panel`) build against, so their signatures are
 * as much of the deliverable as their behaviour. Both are pure over a
 * `SessionUser`, which is what makes the negative cases testable without a
 * browser, a cookie or a database.
 *
 * Two rules from CLAUDE.md §4 are implemented here and nowhere else:
 *
 * 1. **Every mutation calls `requireRole()`.** Hiding a button is UX. The
 *    server decides.
 * 2. **Every institution-scoped read is filtered by the session's
 *    institution** — by `scopeToInstitution`, never by an id from the request.
 *    An institution user who edits the URL gets their own data back, not
 *    somebody else's.
 *
 * ### Why the hierarchy is explicit rather than ordered
 *
 * `admin > editor > institution_admin > institution_editor` reads like a
 * ladder, and it is not one: an `institution_admin` outranks an
 * `institution_editor` *within their own institution* and has no standing at
 * all outside it. Modelling that as a numeric level invites
 * `level >= INSTITUTION_ADMIN` checks that quietly grant an institution user a
 * staff-only screen. So each role names the roles it satisfies, and the
 * institution boundary is enforced separately, by scope.
 */

import type { SessionUser, UserRole } from './session';

/** Roles that operate across every institution. */
export const STAFF_ROLES = ['admin', 'editor'] as const satisfies readonly UserRole[];
/** Roles confined to a single institution. */
export const INSTITUTION_ROLES = [
  'institution_admin',
  'institution_editor',
] as const satisfies readonly UserRole[];

/**
 * What each role satisfies. `admin` satisfies every staff role; it does *not*
 * satisfy the institution roles, because "an admin can do anything" is a
 * statement about staff screens, and an admin acting on one institution's data
 * does so through a staff screen with the institution id passed explicitly.
 */
const SATISFIES: Readonly<Record<UserRole, readonly UserRole[]>> = {
  admin: ['admin', 'editor'],
  editor: ['editor'],
  institution_admin: ['institution_admin', 'institution_editor'],
  institution_editor: ['institution_editor'],
};

export class AuthError extends Error {
  constructor(
    message: string,
    readonly reason: 'unauthenticated' | 'forbidden',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function isStaff(user: Pick<SessionUser, 'role'> | null | undefined): boolean {
  return user != null && (STAFF_ROLES as readonly UserRole[]).includes(user.role);
}

/** True when `user` holds at least one of `allowed`. Pure; no session read. */
export function hasRole(
  user: Pick<SessionUser, 'role'> | null | undefined,
  allowed: readonly UserRole[],
): boolean {
  if (!user) return false;
  const satisfied = SATISFIES[user.role] ?? [];
  return allowed.some((role) => satisfied.includes(role));
}

/**
 * Assert that `user` holds one of `allowed`, or throw.
 *
 * Throwing rather than returning a boolean is deliberate: a caller that forgets
 * to check a returned `false` still ships, while a caller that forgets to await
 * this does not get past review. The two failure reasons are distinguished so a
 * route can answer 401 vs 403 — but both render the same to the user, because
 * "this exists but you may not see it" is itself information.
 */
export function requireRole(
  user: SessionUser | null | undefined,
  allowed: readonly UserRole[],
): SessionUser {
  if (!user) throw new AuthError('No hay sesión iniciada.', 'unauthenticated');
  if (!hasRole(user, allowed)) throw new AuthError('No tenés permiso para esto.', 'forbidden');
  return user;
}

/**
 * The institution id a query must filter on, for this session.
 *
 * - **Staff** may act on any institution, but must say which: `requested` is
 *   required and is returned as given.
 * - **An institution user** always gets their own id, whatever `requested`
 *   says. A mismatched request is not silently coerced — it throws, because a
 *   request for another institution's data is either a bug or an attack, and
 *   both deserve to be loud.
 *
 * The return value is the *only* id a caller may put in a WHERE clause. Passing
 * a raw `searchParams` value straight to a query is the bug this exists to make
 * impossible.
 */
export function scopeToInstitution(
  user: SessionUser | null | undefined,
  requested?: number | null,
): number {
  if (!user) throw new AuthError('No hay sesión iniciada.', 'unauthenticated');

  if (isStaff(user)) {
    if (requested == null) {
      throw new AuthError('Falta indicar la institución.', 'forbidden');
    }
    return requested;
  }

  if (user.institutionId == null) {
    // An institution role with no institution attached can reach nothing. This
    // is the state an invited-but-unassigned member is in.
    throw new AuthError('Tu usuario no está asociado a ninguna institución.', 'forbidden');
  }

  if (requested != null && requested !== user.institutionId) {
    throw new AuthError('No tenés permiso para acceder a esa institución.', 'forbidden');
  }

  return user.institutionId;
}

/**
 * True when this session may act on `institutionId` — the boolean form, for
 * deciding whether to render something. Never use it *instead* of
 * `scopeToInstitution` in a query.
 */
export function canAccessInstitution(
  user: SessionUser | null | undefined,
  institutionId: number,
): boolean {
  if (!user) return false;
  if (isStaff(user)) return true;
  return user.institutionId === institutionId;
}
