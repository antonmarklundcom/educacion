/**
 * **The acceptance bar for PR-35.**
 *
 * Two properties, and both are security properties rather than features:
 *
 * 1. **The request path is not an enumeration oracle.** An unknown address and
 *    a suspended account must be indistinguishable from a real one — and the
 *    only way to be sure is to assert that *no row is written* in either case,
 *    because a caller that wrote a token for a suspended user would still
 *    render the same sentence and look fine in a browser.
 * 2. **A link is spendable once.** The guarantee does not live in the pure
 *    `resetTokenState` check — that one races. It lives in
 *    `UPDATE … WHERE used_at IS NULL` reporting zero affected rows, so the test
 *    forces exactly that and asserts the password write never happened.
 *
 * The database is faked (the same shape as `claims.access.test.ts`); nothing in
 * the token or password path is. `writes` is the canary: a refusal that still
 * touched `users` has not refused.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { getTableName, type Table } from 'drizzle-orm';

import type { Db } from '@/db';
import { hashResetToken } from '@/lib/auth/reset-token';
import { verifyPassword } from '@/lib/auth/password';

import {
  consumePasswordReset,
  lookupResetToken,
  purgeUsedResetTokens,
  requestPasswordReset,
} from './password-reset';

/* -------------------------------------------------------------------------- */
/* The fake database                                                           */
/* -------------------------------------------------------------------------- */

let rowsByTable: Record<string, unknown[]> = {};
let writes: string[] = [];
/** Values handed to the most recent `insert`/`update` per table. */
let valuesByTable: Record<string, Record<string, unknown>> = {};
let affectedByTable: Record<string, number> = {};

function selectChain(): unknown {
  let rows: unknown[] = [];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (value: unknown) => void) => resolve(rows);
        if (prop === 'from') {
          return (table: Table) => {
            rows = rowsByTable[getTableName(table)] ?? [];
            return proxy;
          };
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

function writeChain(kind: 'insert' | 'update' | 'delete', table: Table): unknown {
  const name = getTableName(table);
  writes.push(`${kind}:${name}`);
  const result = [{ affectedRows: affectedByTable[name] ?? 1, insertId: 99 }];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (value: unknown) => void) => resolve(result);
        if (prop === 'values' || prop === 'set') {
          return (value: Record<string, unknown>) => {
            valuesByTable[name] = value;
            return proxy;
          };
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

const fakeDb = {
  select: () => selectChain(),
  insert: (table: Table) => writeChain('insert', table),
  update: (table: Table) => writeChain('update', table),
  delete: (table: Table) => writeChain('delete', table),
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb),
} as unknown as Db;

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const NOW = new Date('2026-08-12T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const TOKEN = 'un-token-de-prueba';

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    email: 'rectorado@uni.edu.py',
    name: 'Ana Rectora',
    status: 'active' as const,
    ...overrides,
  };
}

function liveToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 21,
    userId: 5,
    expiresAt: new Date(NOW.getTime() + HOUR),
    usedAt: null,
    email: 'rectorado@uni.edu.py',
    ...overrides,
  };
}

beforeEach(() => {
  rowsByTable = {};
  writes = [];
  valuesByTable = {};
  affectedByTable = {};
});

/* -------------------------------------------------------------------------- */
/* Requesting a link                                                           */
/* -------------------------------------------------------------------------- */

describe('requesting a reset link answers the same thing for everybody', () => {
  it('mints a token for an active account and never persists the plaintext', async () => {
    rowsByTable.users = [activeUser()];

    const request = await requestPasswordReset('Rectorado@UNI.edu.py', NOW, fakeDb);

    expect(request?.email).toBe('rectorado@uni.edu.py');
    expect(writes).toEqual(['insert:password_reset_tokens']);
    // What lands in the row is the digest, never the link somebody was emailed.
    expect(valuesByTable.password_reset_tokens.tokenHash).toBe(hashResetToken(request!.token));
    expect(JSON.stringify(valuesByTable.password_reset_tokens)).not.toContain(request!.token);
  });

  /**
   * The refusals are asserted through `writes` rather than the return value:
   * the return value is what the page ignores, and the row is what an attacker
   * could otherwise detect by timing or by a later "this link is expired".
   */
  it('writes nothing for an address nobody registered', async () => {
    rowsByTable.users = [];
    expect(await requestPasswordReset('nadie@ejemplo.com', NOW, fakeDb)).toBeNull();
    expect(writes).toEqual([]);
  });

  it('writes nothing for a suspended account', async () => {
    rowsByTable.users = [activeUser({ status: 'suspended' })];
    expect(await requestPasswordReset('rectorado@uni.edu.py', NOW, fakeDb)).toBeNull();
    expect(writes).toEqual([]);
  });

  it('writes nothing for an empty address', async () => {
    expect(await requestPasswordReset('   ', NOW, fakeDb)).toBeNull();
    expect(writes).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Reading a link                                                              */
/* -------------------------------------------------------------------------- */

describe('looking a token up never spends it', () => {
  it('reports a live token as ok and writes nothing', async () => {
    rowsByTable.password_reset_tokens = [liveToken()];
    expect(await lookupResetToken(TOKEN, NOW, fakeDb)).toEqual({
      state: 'ok',
      email: 'rectorado@uni.edu.py',
    });
    expect(writes).toEqual([]);
  });

  it('reports an unknown token without leaking an address', async () => {
    rowsByTable.password_reset_tokens = [];
    expect(await lookupResetToken(TOKEN, NOW, fakeDb)).toEqual({ state: 'unknown', email: null });
  });

  it('reports an expired token as expired', async () => {
    rowsByTable.password_reset_tokens = [liveToken({ expiresAt: new Date(NOW.getTime() - HOUR) })];
    expect((await lookupResetToken(TOKEN, NOW, fakeDb)).state).toBe('expired');
  });
});

/* -------------------------------------------------------------------------- */
/* Spending a link                                                             */
/* -------------------------------------------------------------------------- */

describe('a reset link is spendable exactly once', () => {
  it('writes the new password, clears must_change_password and kills the other links', async () => {
    rowsByTable.password_reset_tokens = [liveToken()];

    const outcome = await consumePasswordReset(TOKEN, 'una-clave-larga-y-nueva', NOW, fakeDb);

    expect(outcome).toEqual({ ok: true, email: 'rectorado@uni.edu.py' });
    // Order is the guarantee: the token is claimed before the password moves.
    expect(writes).toEqual([
      'update:password_reset_tokens',
      'update:users',
      'update:password_reset_tokens',
      'insert:activity_log',
    ]);
    expect(valuesByTable.users.mustChangePassword).toBe(false);
    expect(
      await verifyPassword('una-clave-larga-y-nueva', String(valuesByTable.users.passwordHash)),
    ).toBe(true);
  });

  /** The log records that a password changed — never the password or the hash. */
  it('logs the reset without the credential', async () => {
    rowsByTable.password_reset_tokens = [liveToken()];
    await consumePasswordReset(TOKEN, 'una-clave-larga-y-nueva', NOW, fakeDb);

    const logged = JSON.stringify(valuesByTable.activity_log);
    expect(logged).not.toContain('una-clave-larga-y-nueva');
    expect(logged).not.toContain(String(valuesByTable.users.passwordHash));
  });

  /**
   * The race: two tabs POST the same link, the second one reads a row that is
   * still `used_at IS NULL`, and only the conditional UPDATE stops it. Zero
   * affected rows must leave the password untouched.
   */
  it('refuses when the conditional update claims nothing, and touches no user', async () => {
    rowsByTable.password_reset_tokens = [liveToken()];
    affectedByTable.password_reset_tokens = 0;

    const outcome = await consumePasswordReset(TOKEN, 'otra-clave-distinta', NOW, fakeDb);

    expect(outcome).toEqual({ ok: false, reason: 'used' });
    expect(writes).toEqual(['update:password_reset_tokens']);
    expect(valuesByTable.users).toBeUndefined();
  });

  it('refuses an already-used token before any write', async () => {
    rowsByTable.password_reset_tokens = [liveToken({ usedAt: new Date(NOW.getTime() - HOUR) })];
    expect(await consumePasswordReset(TOKEN, 'otra-clave-distinta', NOW, fakeDb)).toEqual({
      ok: false,
      reason: 'used',
    });
    expect(writes).toEqual([]);
  });

  it('refuses an expired token before any write', async () => {
    rowsByTable.password_reset_tokens = [liveToken({ expiresAt: new Date(NOW.getTime() - HOUR) })];
    expect(await consumePasswordReset(TOKEN, 'otra-clave-distinta', NOW, fakeDb)).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(writes).toEqual([]);
  });

  it('refuses an unknown token before any write', async () => {
    rowsByTable.password_reset_tokens = [];
    expect(await consumePasswordReset(TOKEN, 'otra-clave-distinta', NOW, fakeDb)).toEqual({
      ok: false,
      reason: 'unknown',
    });
    expect(writes).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Housekeeping                                                                */
/* -------------------------------------------------------------------------- */

describe('purging spent tokens', () => {
  it('deletes only when there is something to delete', async () => {
    rowsByTable.password_reset_tokens = [{ count: 0 }];
    expect(await purgeUsedResetTokens(NOW, fakeDb)).toBe(0);
    expect(writes).toEqual([]);
  });

  it('reports how many rows it removed', async () => {
    rowsByTable.password_reset_tokens = [{ count: 4 }];
    expect(await purgeUsedResetTokens(NOW, fakeDb)).toBe(4);
    expect(writes).toEqual(['delete:password_reset_tokens']);
  });
});
