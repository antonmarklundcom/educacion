/**
 * **The acceptance bar for PR-36.**
 *
 * This module mints logins, so it is tested the way `claims.access.test.ts` and
 * `panel/access.test.ts` are: only the database is faked, and **a write is the
 * canary**. Every refusal below asserts not just that an error came back but
 * that no row was written — a screen that refuses *after* creating the account
 * or issuing the link has not refused.
 *
 * `editor` is the case that carries the weight. It satisfies every other
 * `/admin` screen, so a `requireRole(actor, ['editor'])` here would read as
 * correct in review and would hand data-curation staff the ability to issue
 * themselves an access link for an admin account.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { getTableName, type Table } from 'drizzle-orm';

import type { Db } from '@/db';
import { AuthError } from '@/lib/auth/roles';
import { hashResetToken } from '@/lib/auth/reset-token';
import type { SessionUser } from '@/lib/auth/session';

import { createUser, issueAccessLink, listUsers, setUserStatus } from './users';

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

const ADMIN: SessionUser = { id: 1, role: 'admin', institutionId: null, mustChangePassword: false };
const EDITOR: SessionUser = {
  id: 2,
  role: 'editor',
  institutionId: null,
  mustChangePassword: false,
};
const INSTITUTION_ADMIN: SessionUser = {
  id: 3,
  role: 'institution_admin',
  institutionId: 9,
  mustChangePassword: false,
};

/* -------------------------------------------------------------------------- */
/* The fake database                                                           */
/* -------------------------------------------------------------------------- */

let rowsByTable: Record<string, unknown[]> = {};
let writes: string[] = [];
let valuesByTable: Record<string, Record<string, unknown>> = {};

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
  const result = [{ affectedRows: 1, insertId: 77 }];
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

const NOW = new Date('2026-08-12T12:00:00Z');

beforeEach(() => {
  rowsByTable = {};
  writes = [];
  valuesByTable = {};
});

function expectNoWrite() {
  expect(writes).toEqual([]);
}

/* -------------------------------------------------------------------------- */
/* Who may reach this module at all                                            */
/* -------------------------------------------------------------------------- */

describe('every function here is admin-only', () => {
  const input = {
    email: 'nueva@uni.edu.py',
    name: 'Ana',
    role: 'institution_admin' as const,
    institutionId: 9,
  };

  it('refuses a signed-out request', async () => {
    await expect(listUsers(null, NOW, fakeDb)).rejects.toThrow(AuthError);
    await expect(createUser(null, input, fakeDb)).rejects.toThrow(AuthError);
    await expect(issueAccessLink(null, 5, NOW, fakeDb)).rejects.toThrow(AuthError);
    await expect(setUserStatus(null, 5, 'suspended', NOW, fakeDb)).rejects.toThrow(AuthError);
    expectNoWrite();
  });

  /**
   * The one that matters: `editor` passes every other `/admin` guard.
   */
  it('refuses an editor — curation staff do not mint logins', async () => {
    await expect(listUsers(EDITOR, NOW, fakeDb)).rejects.toThrow(AuthError);
    await expect(createUser(EDITOR, input, fakeDb)).rejects.toThrow(AuthError);
    await expect(issueAccessLink(EDITOR, 5, NOW, fakeDb)).rejects.toThrow(AuthError);
    await expect(setUserStatus(EDITOR, 5, 'suspended', NOW, fakeDb)).rejects.toThrow(AuthError);
    expectNoWrite();
  });

  it('refuses an institution admin — this is a staff screen', async () => {
    await expect(createUser(INSTITUTION_ADMIN, input, fakeDb)).rejects.toThrow(AuthError);
    await expect(issueAccessLink(INSTITUTION_ADMIN, 5, NOW, fakeDb)).rejects.toThrow(AuthError);
    expectNoWrite();
  });
});

/* -------------------------------------------------------------------------- */
/* Creating an account                                                         */
/* -------------------------------------------------------------------------- */

describe('creating an account', () => {
  it('creates it inert — no password, status invited — and adds the membership', async () => {
    rowsByTable.users = [];

    await createUser(
      ADMIN,
      { email: 'Nueva@UNI.edu.py', name: 'Ana', role: 'institution_admin', institutionId: 9 },
      fakeDb,
    );

    expect(writes).toEqual(['insert:users', 'insert:institution_members', 'insert:activity_log']);
    expect(valuesByTable.users.passwordHash).toBeNull();
    expect(valuesByTable.users.status).toBe('invited');
    // Normalised, so a capitalised address cannot become a second account.
    expect(valuesByTable.users.email).toBe('nueva@uni.edu.py');
  });

  it('does not create a membership row for a staff account', async () => {
    rowsByTable.users = [];
    await createUser(
      ADMIN,
      { email: 'staff@educacion.com.py', name: null, role: 'editor', institutionId: null },
      fakeDb,
    );
    expect(writes).toEqual(['insert:users', 'insert:activity_log']);
  });

  it('refuses a staff role carrying an institution, before writing', async () => {
    await expect(
      createUser(
        ADMIN,
        { email: 'staff@educacion.com.py', name: null, role: 'admin', institutionId: 9 },
        fakeDb,
      ),
    ).rejects.toThrow(/no se vincula/i);
    expectNoWrite();
  });

  it('refuses an institution role without an institution, before writing', async () => {
    await expect(
      createUser(
        ADMIN,
        { email: 'x@uni.edu.py', name: null, role: 'institution_editor', institutionId: null },
        fakeDb,
      ),
    ).rejects.toThrow(/Elegí la institución/i);
    expectNoWrite();
  });

  it('refuses a duplicate address, before writing', async () => {
    rowsByTable.users = [{ id: 5 }];
    await expect(
      createUser(
        ADMIN,
        { email: 'ya@existe.com', name: null, role: 'editor', institutionId: null },
        fakeDb,
      ),
    ).rejects.toThrow(/Ya existe/i);
    expectNoWrite();
  });

  it('refuses an address that is not one, before writing', async () => {
    await expect(
      createUser(
        ADMIN,
        { email: 'no-arroba', name: null, role: 'editor', institutionId: null },
        fakeDb,
      ),
    ).rejects.toThrow(/no parece válida/i);
    expectNoWrite();
  });
});

/* -------------------------------------------------------------------------- */
/* Issuing a link                                                              */
/* -------------------------------------------------------------------------- */

describe('issuing an access link', () => {
  it('stores the digest, returns the plaintext, and kills the previous links', async () => {
    rowsByTable.users = [{ id: 5, email: 'ana@uni.edu.py', status: 'invited' }];

    const link = await issueAccessLink(ADMIN, 5, NOW, fakeDb);

    // Invalidate first, then mint: the order is what stops two live links.
    expect(writes).toEqual([
      'update:password_reset_tokens',
      'insert:password_reset_tokens',
      'insert:activity_log',
    ]);
    expect(valuesByTable.password_reset_tokens.tokenHash).toBe(hashResetToken(link.token));
    expect(JSON.stringify(valuesByTable.password_reset_tokens)).not.toContain(link.token);
    // 72 h, not the self-service hour — the link travels by WhatsApp.
    expect(link.expiresAt.getTime() - NOW.getTime()).toBe(72 * 60 * 60 * 1000);
  });

  /** The token must not be reconstructible from anything an operator can read. */
  it('never writes the token to the activity log', async () => {
    rowsByTable.users = [{ id: 5, email: 'ana@uni.edu.py', status: 'invited' }];
    const link = await issueAccessLink(ADMIN, 5, NOW, fakeDb);

    const logged = JSON.stringify(valuesByTable.activity_log);
    expect(logged).not.toContain(link.token);
    expect(logged).not.toContain(hashResetToken(link.token));
  });

  it('refuses a suspended account — suspension is the revocation', async () => {
    rowsByTable.users = [{ id: 5, email: 'ana@uni.edu.py', status: 'suspended' }];
    await expect(issueAccessLink(ADMIN, 5, NOW, fakeDb)).rejects.toThrow(AuthError);
    expectNoWrite();
  });

  it('refuses an account that does not exist', async () => {
    rowsByTable.users = [];
    await expect(issueAccessLink(ADMIN, 5, NOW, fakeDb)).rejects.toThrow(/no existe/i);
    expectNoWrite();
  });
});

/* -------------------------------------------------------------------------- */
/* Suspending                                                                  */
/* -------------------------------------------------------------------------- */

describe('suspending and reactivating', () => {
  it('suspending also kills every outstanding link', async () => {
    rowsByTable.users = [{ id: 5, status: 'active', passwordHash: 'scrypt$…' }];
    await setUserStatus(ADMIN, 5, 'suspended', NOW, fakeDb);

    expect(writes).toEqual(['update:users', 'update:password_reset_tokens', 'insert:activity_log']);
    expect(valuesByTable.users.status).toBe('suspended');
  });

  /**
   * `active` with a null password hash is a state `authenticate` refuses, so
   * showing it as active on this screen would be a lie about who can sign in.
   */
  it('reactivating an account with no password returns it to invited', async () => {
    rowsByTable.users = [{ id: 5, status: 'suspended', passwordHash: null }];
    await setUserStatus(ADMIN, 5, 'active', NOW, fakeDb);
    expect(valuesByTable.users.status).toBe('invited');
  });

  it('refuses self-suspension, before writing', async () => {
    await expect(setUserStatus(ADMIN, ADMIN.id, 'suspended', NOW, fakeDb)).rejects.toThrow(
      /tu propia cuenta/i,
    );
    expectNoWrite();
  });
});
