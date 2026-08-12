/**
 * The admin half of PR-24: every read/write on `/admin/disputas` must throw
 * `AuthError` before it reaches the database when called with no staff
 * session — same negative-case shape as
 * `admin/mutations-require-role.test.ts`, and the reason no db mock is
 * needed here either (`requireRole` throws first).
 */

import { describe, expect, it } from 'vitest';

import { AuthError } from '@/lib/auth/roles';

import { getDispute, listOpenDisputes, resolveAccreditationDispute } from './disputes';

describe('disputes admin surface requires editor', () => {
  it('listOpenDisputes refuses a signed-out request', async () => {
    await expect(listOpenDisputes(null)).rejects.toThrow(AuthError);
  });

  it('listOpenDisputes refuses an institution session', async () => {
    await expect(
      listOpenDisputes({
        id: 1,
        role: 'institution_admin',
        institutionId: 1,
        mustChangePassword: false,
      }),
    ).rejects.toThrow(AuthError);
  });

  it('getDispute refuses without a staff role', async () => {
    await expect(
      getDispute(
        { id: 1, role: 'institution_editor', institutionId: 1, mustChangePassword: false },
        1,
      ),
    ).rejects.toThrow(AuthError);
  });

  it('resolveAccreditationDispute refuses without a staff role', async () => {
    await expect(
      resolveAccreditationDispute(null, 1, { outcome: 'corrected', notes: null }),
    ).rejects.toThrow(AuthError);
  });
});
