/**
 * Billing is `admin`-only, and the check lives inside the query module rather
 * than in the server action — so these call the real functions with no session
 * and with an `editor` session, and assert `AuthError` before anything touches
 * the database (the same negative-case shape as
 * `admin/mutations-require-role.test.ts`).
 *
 * `editor` is the case that matters. It is the role that satisfies every other
 * `/admin` screen, so a mutation that said `['editor']` here would read as
 * correct in review and would hand data curation staff the ability to mark an
 * institution as paying.
 */

import { describe, expect, it } from 'vitest';

import { AuthError } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';

import {
  createSubscription,
  getSubscriptionForEdit,
  listInstitutionsForBilling,
  listSubscriptionsAdmin,
  setSubscriptionStatus,
  updateSubscription,
  type SubscriptionInput,
} from './subscriptions';

const EDITOR: SessionUser = {
  id: 3,
  role: 'editor',
  institutionId: null,
  mustChangePassword: false,
};
const INSTITUTION_ADMIN: SessionUser = {
  id: 4,
  role: 'institution_admin',
  institutionId: 9,
  mustChangePassword: false,
};

const input: SubscriptionInput = {
  institutionId: 9,
  planId: 2,
  status: 'active',
  startsOn: '2026-11-01',
  endsOn: '2027-10-31',
  invoiceRef: 'F001-0000123',
  invoicedAmountPyg: 3_600_000,
  notes: null,
};

describe('subscription mutations without an admin session', () => {
  it('refuses no session at all', async () => {
    await expect(createSubscription(null, input)).rejects.toThrow(AuthError);
    await expect(updateSubscription(null, 1, input)).rejects.toThrow(AuthError);
    await expect(setSubscriptionStatus(null, 1, 'cancelled')).rejects.toThrow(AuthError);
  });

  it('refuses an editor — curation staff do not touch money', async () => {
    await expect(createSubscription(EDITOR, input)).rejects.toThrow(AuthError);
    await expect(updateSubscription(EDITOR, 1, input)).rejects.toThrow(AuthError);
    await expect(setSubscriptionStatus(EDITOR, 1, 'active')).rejects.toThrow(AuthError);
  });

  it('refuses an institution admin — nobody activates their own plan', async () => {
    await expect(createSubscription(INSTITUTION_ADMIN, input)).rejects.toThrow(AuthError);
    await expect(updateSubscription(INSTITUTION_ADMIN, 1, input)).rejects.toThrow(AuthError);
  });
});

describe('subscription reads without an admin session', () => {
  it('refuses the list, the row and the institution picker', async () => {
    await expect(listSubscriptionsAdmin(EDITOR)).rejects.toThrow(AuthError);
    await expect(getSubscriptionForEdit(EDITOR, 1)).rejects.toThrow(AuthError);
    await expect(listInstitutionsForBilling(EDITOR)).rejects.toThrow(AuthError);
    await expect(listSubscriptionsAdmin(null)).rejects.toThrow(AuthError);
  });
});
