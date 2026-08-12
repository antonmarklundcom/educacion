/**
 * The negative cases are the point of this file.
 *
 * `pr-plan.md` PR-18 asks for `requireRole` and `scopeToInstitution` tested
 * "including the negative cases", and CLAUDE.md §4 says an institution-scoped
 * read is filtered by the session's institution. A test that only proves the
 * happy path proves nothing about either: the failure that matters is one
 * institution reading another's rows, and it is asserted here directly against
 * the functions a route handler calls, not through any UI.
 */

import { describe, expect, it } from 'vitest';

import {
  AuthError,
  canAccessInstitution,
  hasRole,
  isStaff,
  requireRole,
  scopeToInstitution,
} from './roles';
import type { SessionUser } from './session';

const admin: SessionUser = {
  id: 1,
  role: 'admin',
  institutionId: null,
  mustChangePassword: false,
};
const editor: SessionUser = { ...admin, id: 2, role: 'editor' };
const instAdmin: SessionUser = {
  id: 3,
  role: 'institution_admin',
  institutionId: 10,
  mustChangePassword: false,
};
const instEditor: SessionUser = { ...instAdmin, id: 4, role: 'institution_editor' };
const unassigned: SessionUser = { ...instAdmin, id: 5, institutionId: null };

describe('requireRole', () => {
  it('accepts a role that satisfies the requirement', () => {
    expect(requireRole(admin, ['editor'])).toBe(admin);
    expect(requireRole(instAdmin, ['institution_editor'])).toBe(instAdmin);
  });

  it('rejects an anonymous request as unauthenticated', () => {
    expect(() => requireRole(null, ['editor'])).toThrow(AuthError);
    try {
      requireRole(undefined, ['admin']);
    } catch (error) {
      expect((error as AuthError).reason).toBe('unauthenticated');
    }
  });

  it('rejects a signed-in user who lacks the role, as forbidden', () => {
    try {
      requireRole(editor, ['admin']);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).reason).toBe('forbidden');
    }
  });

  // The failure mode a numeric role level would have introduced: an
  // institution user reaching a staff screen because their "level" was high.
  it('never lets an institution role satisfy a staff role', () => {
    expect(hasRole(instAdmin, ['admin'])).toBe(false);
    expect(hasRole(instAdmin, ['editor'])).toBe(false);
    expect(() => requireRole(instAdmin, ['editor'])).toThrow(AuthError);
    expect(isStaff(instAdmin)).toBe(false);
  });

  it('never lets a staff role satisfy an institution role by accident', () => {
    expect(hasRole(admin, ['institution_admin'])).toBe(false);
  });

  it('lets institution_admin stand in for institution_editor, but not the reverse', () => {
    expect(hasRole(instAdmin, ['institution_editor'])).toBe(true);
    expect(hasRole(instEditor, ['institution_admin'])).toBe(false);
  });
});

describe('scopeToInstitution', () => {
  it('returns the session institution for an institution user', () => {
    expect(scopeToInstitution(instEditor)).toBe(10);
    expect(scopeToInstitution(instEditor, 10)).toBe(10);
  });

  // This is the test the whole file exists for.
  it('refuses to return another institution to an institution user', () => {
    try {
      scopeToInstitution(instAdmin, 999);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).reason).toBe('forbidden');
    }
  });

  it('never coerces a foreign id silently — it throws rather than returning 10', () => {
    expect(() => scopeToInstitution(instAdmin, 11)).toThrow(AuthError);
  });

  it('rejects an institution user with no institution attached', () => {
    expect(() => scopeToInstitution(unassigned)).toThrow(AuthError);
  });

  it('rejects an anonymous request', () => {
    expect(() => scopeToInstitution(null, 10)).toThrow(AuthError);
  });

  it('lets staff act on any institution, but requires them to name one', () => {
    expect(scopeToInstitution(admin, 42)).toBe(42);
    expect(scopeToInstitution(editor, 7)).toBe(7);
    // No implicit "all institutions": a missing id is a bug, not a wildcard.
    expect(() => scopeToInstitution(admin)).toThrow(AuthError);
    expect(() => scopeToInstitution(admin, null)).toThrow(AuthError);
  });
});

describe('canAccessInstitution', () => {
  it('is false for anonymous and for a foreign institution', () => {
    expect(canAccessInstitution(null, 10)).toBe(false);
    expect(canAccessInstitution(instAdmin, 11)).toBe(false);
  });

  it("is true for staff and for the session's own institution", () => {
    expect(canAccessInstitution(admin, 11)).toBe(true);
    expect(canAccessInstitution(instAdmin, 10)).toBe(true);
  });
});
