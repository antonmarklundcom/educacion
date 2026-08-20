/**
 * The activity viewer's two promises (PR-44): it is `editor`-gated, and it is
 * **read-only** — structurally, not by convention.
 *
 * The canary is the second one. `activity_log` is the record of what everybody
 * else did; a staff member who can edit or delete an entry can edit the record
 * of their own edit, which makes the whole table worth nothing. So this fake
 * database throws on any `insert`, `update`, `delete` or `transaction`: if a
 * later PR adds a write to this module, the suite says so rather than a reviewer
 * having to notice.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

let rows: unknown[] = [];
let limits: number[] = [];
let offsets: number[] = [];

function chain(): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (value: unknown) => void) => resolve(rows);
        if (prop === 'limit')
          return (n: number) => {
            limits.push(n);
            return proxy;
          };
        if (prop === 'offset')
          return (n: number) => {
            offsets.push(n);
            return proxy;
          };
        return () => proxy;
      },
    },
  );
  return proxy;
}

function forbidden(what: string): never {
  throw new Error(`the activity viewer must never ${what}`);
}

const fakeDb = {
  select: () => chain(),
  selectDistinct: () => chain(),
  insert: () => forbidden('insert'),
  update: () => forbidden('update'),
  delete: () => forbidden('delete'),
  transaction: () => forbidden('open a transaction'),
};

vi.mock('@/db', async () => {
  const actual = await vi.importActual<typeof import('@/db')>('@/db');
  return { ...actual, db: fakeDb };
});

const activityModule = await import('./activity');
const { ACTIVITY_PAGE_SIZE, listActivity, listActivityActors, listActivityEntityTypes } =
  activityModule;

beforeEach(() => {
  rows = [];
  limits = [];
  offsets = [];
});

describe('the module is read-only', () => {
  it('has no export that writes, including ones added after this test', async () => {
    // The fake database throws on any write, but that only catches a write on a
    // path some other test happens to exercise — the independent review added a
    // `redactEntry` export and the suite stayed green. So this enumerates the
    // module: every exported function is called and, whatever it does, it may
    // not be a write.
    //
    // **One argument, not several.** Every function here takes the session
    // first and defaults its database to the module's own connection, so
    // `fn(editor)` reaches the fake db. Passing extra arguments would fill that
    // parameter with a stub and the write would land somewhere unobserved —
    // which is exactly how the first version of this test let `redactEntry`
    // through.
    const exported = Object.entries(activityModule).filter(
      ([, value]) => typeof value === 'function',
    );
    expect(exported.length, 'the module must still export something').toBeGreaterThan(0);

    for (const [name, fn] of exported) {
      let thrown: unknown;
      try {
        await (fn as (...args: unknown[]) => Promise<unknown>)(editor);
      } catch (error) {
        thrown = error;
      }
      expect(
        thrown instanceof Error && thrown.message.startsWith('the activity viewer must never'),
        `${name} reached a write`,
      ).toBe(false);
    }
  });
});

describe('who may read the activity log', () => {
  it.each([
    ['nobody signed in', null],
    ['an institution admin', institutionAdmin],
  ])('refuses %s', async (_label, actor) => {
    await expect(listActivity(actor)).rejects.toThrow();
    await expect(listActivityEntityTypes(actor)).rejects.toThrow();
    await expect(listActivityActors(actor)).rejects.toThrow();
  });

  it.each([
    ['an editor', editor],
    ['an admin', admin],
  ])('lets %s read', async (_label, actor) => {
    await expect(listActivity(actor)).resolves.toBeDefined();
    await expect(listActivityEntityTypes(actor)).resolves.toBeDefined();
    await expect(listActivityActors(actor)).resolves.toBeDefined();
  });
});

describe('listActivity', () => {
  it('pages from 1 and never asks for a negative offset', async () => {
    // A hand-edited `?pagina=-3` must not become `OFFSET -150`, which MySQL
    // rejects and which would put the error boundary on an admin screen.
    for (const page of [undefined, 0, -3, 1.4]) {
      await listActivity(editor, { page });
    }
    expect(offsets.every((offset) => offset >= 0)).toBe(true);
    expect(offsets).toEqual([0, 0, 0, 0]);
  });

  it('asks for exactly one page of rows', async () => {
    await listActivity(editor, { page: 3 });
    expect(limits).toEqual([ACTIVITY_PAGE_SIZE]);
    expect(offsets).toEqual([2 * ACTIVITY_PAGE_SIZE]);
  });

  it('reports at least one page even when the log is empty', async () => {
    rows = [];
    const result = await listActivity(editor);
    expect(result.totalPages).toBe(1);
    expect(result.entries).toEqual([]);
  });

  it('normalises a missing snapshot to null rather than leaving it undefined', async () => {
    rows = [row({ entityType: 'price', before: undefined, after: { amount: 1 } })];
    const result = await listActivity(admin);
    expect(result.entries[0].before).toBeNull();
    expect(result.entries[0].after).toEqual({ amount: 1 });
  });
});

/* -------------------------------------------------------------------------- */
/* What an editor is allowed to read back                                     */
/* -------------------------------------------------------------------------- */

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    actorId: 7,
    actorEmail: 'staff@educacion.com.py',
    actorName: null,
    entityType: 'price',
    entityId: 12,
    action: 'update',
    before: { amount: 1 },
    after: { amount: 2 },
    createdAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

describe('what reaches the page', () => {
  it('withholds the actor address from an editor', async () => {
    // The address is the content of the `admin`-only `/admin/usuarios`, and the
    // join hands it back for every account that has ever written a row —
    // institution members included. Withholding it in the page would be UX
    // (CLAUDE.md rule 4); this asserts the *query* does it.
    rows = [row()];
    const result = await listActivity(editor);
    expect(result.entries[0].actorEmail).toBeNull();
    expect(result.entries[0].actorId, 'the id still tells two actors apart').toBe(7);
  });

  it('gives the address to an admin', async () => {
    rows = [row()];
    const result = await listActivity(admin);
    expect(result.entries[0].actorEmail).toBe('staff@educacion.com.py');
  });

  it('withholds an admin-only snapshot from an editor, keeping the row', async () => {
    rows = [row({ entityType: 'user', before: null, after: { email: 'x@y.z', role: 'admin' } })];
    const result = await listActivity(editor);
    expect(result.entries[0].restricted).toBe(true);
    expect(result.entries[0].after).toBeNull();
    expect(result.entries[0].action, 'the row itself is still visible').toBe('update');
    expect(JSON.stringify(result.entries[0])).not.toContain('x@y.z');
  });

  it('shows an ordinary snapshot to an editor', async () => {
    rows = [row()];
    const result = await listActivity(editor);
    expect(result.entries[0].restricted).toBe(false);
    expect(result.entries[0].after).toEqual({ amount: 2 });
  });

  it('strips the address from the actor filter for an editor', async () => {
    rows = [{ id: 7, email: 'staff@educacion.com.py', name: null }];
    expect((await listActivityActors(editor))[0].email).toBeNull();
    expect((await listActivityActors(admin))[0].email).toBe('staff@educacion.com.py');
  });
});
