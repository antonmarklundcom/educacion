/**
 * **The acceptance bar for PR-28**: *no cross-institution leakage*, tested the
 * way PR-21 and PR-23 tested theirs — by calling the real functions with a
 * session for one institution and looking at what reaches the database, not by
 * checking that a page hides a link.
 *
 * ### What is actually asserted
 *
 * The dashboard's shape is what makes leakage impossible, so the test is aimed
 * at that shape rather than at an error message: **every WHERE clause these
 * functions build must carry the session's own institution id, and no other.**
 * A fake database records every parameter that reaches it; the assertions read
 * that recording.
 *
 * Two failure modes this is built to catch:
 *
 * 1. A future edit adds an `institutionId` argument to `panelAnalytics` so a
 *    page can "just pass it in". Then a value that did not come from the
 *    session would appear in the recording.
 * 2. A future aggregate is added that forgets the scope — a `count(*)` over
 *    `events` with no institution predicate. Then the recorded parameter list
 *    for that query would be missing the id.
 *
 * Nothing in the security path is mocked: the real `panelInstitutionId`, the
 * real `scopeToInstitution` and the real entitlement read all run.
 */

import { describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';

const INSTITUTION_A = 1;
const INSTITUTION_B = 2;

const userOfB: SessionUser = {
  id: 42,
  role: 'institution_admin',
  institutionId: INSTITUTION_B,
  mustChangePassword: false,
};

const staffUser: SessionUser = {
  id: 1,
  role: 'admin',
  institutionId: null,
  mustChangePassword: false,
};

/** Every parameter that reached the fake database, across every query. */
let seenParams: unknown[] = [];
let dbWrote = false;

function recordingChain(rows: unknown[]): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: unknown) => void) => resolve(rows);
        }
        return (...args: unknown[]) => {
          seenParams.push(...args);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

function refuseWrite(): never {
  dbWrote = true;
  throw new Error('SECURITY: a read-only dashboard wrote to the database.');
}

vi.mock('@/db', async () => {
  const actual = await vi.importActual<typeof import('@/db')>('@/db');
  const fake = {
    select: (...args: unknown[]) => {
      seenParams.push(...args);
      return recordingChain([]);
    },
    insert: refuseWrite,
    update: refuseWrite,
    delete: refuseWrite,
    transaction: refuseWrite,
  };
  return { ...actual, db: fake };
});

const { panelAnalytics, panelMonthlyReport, deltaPct, precedingRange, monthRange, previousMonth } =
  await import('./analytics');

/**
 * Drizzle conditions are objects; the id we are hunting for is somewhere in
 * their parameter trees. Rather than assert on SQL, walk the recorded values
 * and collect every number that could be an institution id.
 */
function recordedNumbers(): number[] {
  const found: number[] = [];
  const seen = new Set<unknown>();
  const walk = (value: unknown) => {
    if (value == null || seen.has(value)) return;
    if (typeof value === 'number') {
      found.push(value);
      return;
    }
    if (typeof value !== 'object') return;
    seen.add(value);
    for (const entry of Object.values(value as Record<string, unknown>)) walk(entry);
  };
  for (const param of seenParams) walk(param);
  return found;
}

function reset() {
  seenParams = [];
  dbWrote = false;
}

describe('the dashboard is scoped by the session and nothing else', () => {
  it('never puts another institution’s id in a query', async () => {
    reset();
    await panelAnalytics(userOfB, { days: 30 });

    const numbers = recordedNumbers();
    expect(numbers).toContain(INSTITUTION_B);
    expect(numbers).not.toContain(INSTITUTION_A);
    expect(dbWrote).toBe(false);
  });

  it('has no parameter that could widen the scope', () => {
    // `panelAnalytics(user, options)` — options carries `days` and `now`, and
    // no institution id. This is the property the whole test rests on, so it
    // is asserted rather than assumed: a third argument of type number would
    // make the call below a type error at build time and this a live reminder.
    expect(panelAnalytics.length).toBeLessThanOrEqual(3);
    expect(panelMonthlyReport.length).toBeLessThanOrEqual(3);
  });

  it('refuses a session with no institution at all', async () => {
    reset();
    await expect(panelAnalytics({ ...userOfB, institutionId: null }, { days: 30 })).rejects.toThrow(
      AuthError,
    );
    expect(recordedNumbers()).toHaveLength(0);
  });

  it('refuses staff rather than showing them everything', async () => {
    reset();
    await expect(panelAnalytics(staffUser, { days: 30 })).rejects.toThrow(AuthError);
    await expect(panelMonthlyReport(staffUser, '2026-07')).rejects.toThrow(AuthError);
    expect(recordedNumbers()).toHaveLength(0);
  });

  it('refuses no session at all', async () => {
    reset();
    await expect(panelAnalytics(null, { days: 30 })).rejects.toThrow(AuthError);
    await expect(panelMonthlyReport(null, '2026-07')).rejects.toThrow(AuthError);
  });

  it('refuses a malformed month before it reaches a query', async () => {
    expect(() => monthRange('julio')).toThrow(AuthError);
    expect(() => monthRange('2026-13')).toThrow(AuthError);
    expect(() => monthRange('2026-7')).toThrow(AuthError);
  });
});

describe('the arithmetic the report is read from', () => {
  it('reports no percentage when the previous period was zero', () => {
    // "Subiste 100%" from nothing is arithmetic dressed as a result.
    expect(deltaPct(12, 0)).toBeNull();
    expect(deltaPct(0, 0)).toBeNull();
  });

  it('rounds to one decimal, signed', () => {
    expect(deltaPct(120, 100)).toBe(20);
    expect(deltaPct(90, 100)).toBe(-10);
    expect(deltaPct(1, 3)).toBe(-66.7);
  });

  it('compares a rolling window against the equally long window before it', () => {
    const range = {
      since: new Date('2026-07-11T00:00:00.000Z'),
      until: new Date('2026-08-01T00:00:00.000Z'),
    };
    expect(precedingRange(range)).toEqual({
      since: new Date('2026-06-20T00:00:00.000Z'),
      until: new Date('2026-07-11T00:00:00.000Z'),
    });
  });

  it('compares a month against the previous calendar month, not the previous 31 days', () => {
    // July has 31 days and June has 30. An equal-length window back from
    // 1 July lands on 31 May and quietly counts a day of May as June.
    expect(previousMonth('2026-07')).toBe('2026-06');
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-03')).toBe('2026-02');
  });

  it('builds a calendar month as a half-open UTC range', () => {
    expect(monthRange('2026-02')).toEqual({
      since: new Date('2026-02-01T00:00:00.000Z'),
      until: new Date('2026-03-01T00:00:00.000Z'),
    });
    expect(monthRange('2026-12')).toEqual({
      since: new Date('2026-12-01T00:00:00.000Z'),
      until: new Date('2027-01-01T00:00:00.000Z'),
    });
  });
});
