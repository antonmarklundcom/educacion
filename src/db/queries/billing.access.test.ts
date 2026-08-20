/**
 * The three `billing.ts` reads are `admin`-only, and now something says so
 * (PR-46).
 *
 * The independent review of PR-29 deleted all three `requireRole(actor,
 * ['admin'])` calls from `revenueSummary`, `listUpcomingRenewals` and
 * `listPastDue` and ran the whole suite: 1084/1084 passed. `subscriptions.ts`
 * has had this exact test since PR-25 and `billing.ts` never got one, so
 * nothing stopped the next edit from typing `['editor']` here — which is the
 * failure `subscriptions.test.ts`'s own docstring says it exists to prevent.
 *
 * These are revenue figures and a customer list. An `editor` curates the
 * catalog; what an institution pays is not theirs to read.
 */

import { describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@/lib/auth/session';

function chain(): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (value: unknown) => void) => resolve([]);
        return () => proxy;
      },
    },
  );
  return proxy;
}

// A function declaration: `vi.mock`'s factory is hoisted above every import.
function fakeDb(): Record<string, unknown> {
  return { select: () => chain() };
}

vi.mock('@/db', async () => {
  const actual = await vi.importActual<typeof import('@/db')>('@/db');
  return { ...actual, db: fakeDb() };
});

const { listPastDue, listUpcomingRenewals, revenueSummary } = await import('./billing');

const admin: SessionUser = { id: 1, role: 'admin', institutionId: null, mustChangePassword: false };
const TODAY = '2026-08-20';

const REFUSED: [string, SessionUser | null][] = [
  ['nobody signed in', null],
  ['an editor', { id: 2, role: 'editor', institutionId: null, mustChangePassword: false }],
  [
    'an institution admin',
    { id: 3, role: 'institution_admin', institutionId: 9, mustChangePassword: false },
  ],
  [
    'an institution editor',
    { id: 4, role: 'institution_editor', institutionId: 9, mustChangePassword: false },
  ],
];

describe('the revenue view is admin-only', () => {
  it.each(REFUSED)('refuses %s', async (_label, actor) => {
    await expect(revenueSummary(actor, TODAY)).rejects.toThrow();
    await expect(listUpcomingRenewals(actor, TODAY, 60)).rejects.toThrow();
    await expect(listPastDue(actor)).rejects.toThrow();
  });

  it('lets an admin read all three', async () => {
    await expect(revenueSummary(admin, TODAY)).resolves.toBeDefined();
    await expect(listUpcomingRenewals(admin, TODAY, 60)).resolves.toBeDefined();
    await expect(listPastDue(admin)).resolves.toBeDefined();
  });
});
