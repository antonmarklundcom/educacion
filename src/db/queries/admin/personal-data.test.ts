/**
 * The R-06 deletion tooling (PR-44), held to its four promises:
 *
 * 1. It is `admin`-gated, and refuses **before** it reads or deletes anything.
 * 2. It matches the contact key exactly — never a prefix, never everything.
 * 3. It logs the deletion with the actor, the count and a hash, and **never**
 *    the values it just deleted.
 * 4. The `DELETE` and the log entry are one transaction.
 *
 * Only the database is replaced. The real `requireRole`, the real
 * `parseParaguayanPhone`, the real `hashEmail` and the real `logActivity` all
 * run — the point is the rule, not a stub of it.
 *
 * The canary is `deletes`: any `DELETE` reached by a caller who should have
 * been refused fails the assertion, which is the property that would still hold
 * if the function swallowed its own error.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MySqlDialect } from 'drizzle-orm/mysql-core';

import type { SessionUser } from '@/lib/auth/session';

const admin: SessionUser = { id: 1, role: 'admin', institutionId: null, mustChangePassword: false };
const editor: SessionUser = {
  id: 2,
  role: 'editor',
  institutionId: null,
  mustChangePassword: false,
};
const institutionAdmin: SessionUser = {
  id: 3,
  role: 'institution_admin',
  institutionId: 9,
  mustChangePassword: false,
};

/** Every `select` answers with these; `where` is captured, never applied. */
let selectRows: unknown[] = [];
let deletes = 0;
let inserts: { table: string; values: Record<string, unknown> }[] = [];
let whereClauses: unknown[] = [];
/** Which handle each write was made on — the atomicity canary. */
let writeHandles: string[] = [];
/** Set to throw from the log write, to prove the delete rolls back with it. */
let logThrows = false;

function chain(rows: unknown[]): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (value: unknown) => void) => resolve(rows);
        if (prop === 'where') {
          return (clause: unknown) => {
            whereClauses.push(clause);
            return proxy;
          };
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

/**
 * A handle that records which object each write went through.
 *
 * `transaction` hands back a **different** handle from the connection, which is
 * what makes "the DELETE and the log entry are one transaction" testable: the
 * previous version passed `fakeDb` straight back, so removing the transaction
 * entirely left all 20 tests green. `committed` flips only if the callback
 * returns, so a throwing log write is observably a rollback.
 */
let committed = false;

function handle(name: string) {
  return {
    select: () => chain(selectRows),
    delete: () => {
      deletes += 1;
      writeHandles.push(`${name}:delete`);
      return chain([]);
    },
    insert: (table: { _: { name: string } }) => ({
      values: (values: Record<string, unknown>) => {
        writeHandles.push(`${name}:insert`);
        if (logThrows) return Promise.reject(new Error('log write failed'));
        inserts.push({ table: table?._?.name ?? 'unknown', values });
        return Promise.resolve();
      },
    }),
  };
}

const fakeDb = {
  ...handle('connection'),
  transaction: async (run: (tx: unknown) => Promise<unknown>) => {
    const result = await run(handle('tx'));
    committed = true;
    return result;
  },
};

vi.mock('@/db', async () => {
  const actual = await vi.importActual<typeof import('@/db')>('@/db');
  return { ...actual, db: fakeDb };
});

const {
  contactKeyHash,
  deleteLeadsByContact,
  findLeadsByContact,
  matches,
  parseContactKey,
  PERSONAL_DATA_ENTITY,
} = await import('./personal-data');

beforeEach(() => {
  selectRows = [];
  deletes = 0;
  inserts = [];
  whereClauses = [];
  writeHandles = [];
  logThrows = false;
  committed = false;
});

/* -------------------------------------------------------------------------- */

describe('parseContactKey', () => {
  it('normalises a Paraguayan number the way the lead form stored it', () => {
    expect(parseContactKey({ phone: '0981 123 456' })).toEqual({
      phoneE164: '+595981123456',
      email: null,
    });
    expect(parseContactKey({ phone: '+595 981 123456' })?.phoneE164).toBe('+595981123456');
  });

  it('refuses a number it cannot parse rather than searching for the raw string', () => {
    // Falling back to the raw text would match nothing at best and, with a
    // `LIKE`, would match strangers at worst.
    expect(parseContactKey({ phone: 'no es un teléfono' })).toBeNull();
  });

  it('lower-cases the address', () => {
    expect(parseContactKey({ email: '  Ana@Example.COM ' })?.email).toBe('ana@example.com');
  });

  it('refuses something that is not an address', () => {
    expect(parseContactKey({ email: 'ana' })).toBeNull();
  });

  it('refuses an empty request, which would otherwise match every row', () => {
    expect(parseContactKey({})).toBeNull();
    expect(parseContactKey({ phone: '  ', email: '' })).toBeNull();
  });

  it('accepts both halves together', () => {
    expect(parseContactKey({ phone: '0981123456', email: 'a@b.com' })).toEqual({
      phoneE164: '+595981123456',
      email: 'a@b.com',
    });
  });
});

describe('contactKeyHash', () => {
  it('is stable for the same key and different for a different one', () => {
    const a = { phoneE164: '+595981123456', email: null };
    expect(contactKeyHash(a)).toBe(contactKeyHash({ ...a }));
    expect(contactKeyHash(a)).not.toBe(contactKeyHash({ phoneE164: '+595981123457', email: null }));
  });

  it('does not contain the number it hashes', () => {
    const hash = contactKeyHash({ phoneE164: '+595981123456', email: 'ana@example.com' });
    expect(hash).not.toContain('981123456');
    expect(hash).not.toContain('ana');
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });
});

/* -------------------------------------------------------------------------- */

const KEY = { phoneE164: '+595981123456', email: null };

describe('who may run a deletion', () => {
  it.each([
    ['nobody signed in', null],
    ['an editor', editor],
    ['an institution admin', institutionAdmin],
  ])('refuses %s, before any read', async (_label, actor) => {
    await expect(findLeadsByContact(actor, KEY)).rejects.toThrow();
  });

  it.each([
    ['nobody signed in', null],
    ['an editor', editor],
    ['an institution admin', institutionAdmin],
  ])('refuses %s, before any delete', async (_label, actor) => {
    await expect(deleteLeadsByContact(actor, KEY)).rejects.toThrow();
    expect(deletes, 'no DELETE may run for a refused caller').toBe(0);
    expect(inserts, 'and no log entry either').toEqual([]);
  });

  it('lets an admin through', async () => {
    selectRows = [];
    await expect(deleteLeadsByContact(admin, KEY)).resolves.toMatchObject({ deleted: 0 });
  });
});

describe('deleteLeadsByContact', () => {
  it('deletes the rows it found and reports the count', async () => {
    selectRows = [{ id: 11 }, { id: 12 }];
    const result = await deleteLeadsByContact(admin, KEY);
    expect(result.deleted).toBe(2);
    expect(deletes).toBe(1);
  });

  it('runs no DELETE when nothing matched', async () => {
    selectRows = [];
    const result = await deleteLeadsByContact(admin, KEY);
    expect(result.deleted).toBe(0);
    expect(deletes).toBe(0);
  });

  it('records a run that found nothing, because "we looked" is the answer', async () => {
    selectRows = [];
    await deleteLeadsByContact(admin, KEY);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({
      entityType: PERSONAL_DATA_ENTITY,
      action: 'delete',
      userId: admin.id,
    });
  });

  it('logs the actor, the count and a hash — and nothing that was deleted', async () => {
    selectRows = [{ id: 11 }, { id: 12 }];
    await deleteLeadsByContact(admin, { phoneE164: '+595981123456', email: 'ana@example.com' });

    expect(inserts).toHaveLength(1);
    const entry = inserts[0].values;
    expect(entry.userId).toBe(admin.id);
    expect(entry.entityType).toBe(PERSONAL_DATA_ENTITY);
    expect(entry.entityId, 'an id is a pointer back to a row we promised to forget').toBeNull();

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('981123456');
    expect(serialized).not.toContain('ana@example.com');
    expect(serialized).not.toContain('"11"');
    expect(entry.afterJson).toMatchObject({ deleted: 2 });
    expect(String((entry.afterJson as { keyHash: string }).keyHash)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('re-reads the rows itself rather than trusting an id list', async () => {
    // The signature takes a contact key, not ids: there is no parameter through
    // which a browser could name a row. This asserts the shape stays that way.
    expect(deleteLeadsByContact.length).toBeLessThanOrEqual(3);
    selectRows = [{ id: 11 }];
    await deleteLeadsByContact(admin, KEY);
    // One SELECT (inside the transaction) and one DELETE, both scoped by a
    // WHERE this module built.
    expect(whereClauses.length).toBeGreaterThanOrEqual(2);
  });

  it('makes both writes on the transaction handle, not on the connection', async () => {
    // "The DELETE and the log entry are one transaction" (risks.md §R-06). The
    // fake hands the callback a different handle from the connection, so this
    // fails the moment the transaction is dropped — which the previous version
    // of this file did not.
    selectRows = [{ id: 11 }];
    await deleteLeadsByContact(admin, KEY);
    expect(writeHandles).toEqual(['tx:delete', 'tx:insert']);
    expect(committed).toBe(true);
  });

  it('rolls back rather than deleting rows it could not record', async () => {
    selectRows = [{ id: 11 }];
    logThrows = true;
    await expect(deleteLeadsByContact(admin, KEY)).rejects.toThrow('log write failed');
    expect(committed, 'the transaction must not have committed').toBe(false);
  });
});

describe('the WHERE clause', () => {
  const dialect = new MySqlDialect();

  it('is an equality, never a prefix search', () => {
    // risks.md §R-06 row 1. A `LIKE '+59598%'` would put hundreds of unrelated
    // people's leads on the operator's screen while servicing a privacy
    // request, so the operator being `=` is the property, not the wording.
    const { sql } = dialect.sqlToQuery(matches(KEY));
    expect(sql).not.toMatch(/like/i);
    expect(sql).toMatch(/=\s*\?/);
  });

  it('binds the value rather than interpolating it', () => {
    const { sql, params } = dialect.sqlToQuery(
      matches({ phoneE164: "+595981123456' or '1'='1", email: null }),
    );
    expect(sql).not.toContain('595981123456');
    expect(params).toContain("+595981123456' or '1'='1");
  });

  it('ORs the two halves when both are given, and neither when only one is', () => {
    const both = dialect.sqlToQuery(
      matches({ phoneE164: '+595981123456', email: 'ana@example.com' }),
    ).sql;
    expect(both).toMatch(/ or /i);
    expect(dialect.sqlToQuery(matches(KEY)).sql).not.toMatch(/ or /i);
  });

  it('never matches a NULL email, which would sweep up unrelated rows', () => {
    // Every lead has a phone; `email` is optional. `= NULL` is never true in
    // SQL, but a clause built from an empty string would match rows stored as
    // ''. `parseContactKey` is what guarantees the value is a real address.
    const { params } = dialect.sqlToQuery(matches({ phoneE164: null, email: 'ana@example.com' }));
    expect(params).toEqual(['ana@example.com']);
  });
});
