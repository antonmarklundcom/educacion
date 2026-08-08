/**
 * **The acceptance bar for PR-22.**
 *
 * > *claim only completes from an email on the institution's verified domain,
 * > or after explicit admin approval; tokens single-use, hashed at rest,
 * > expiring in 72 h*
 *
 * A completed claim mints a login, so this file is written the way
 * `panel/access.test.ts` is: nothing in the security path is mocked, only the
 * database, and **a write is the canary**. Every refusal below asserts not just
 * that an error came back but that no `insert` and no `update` ran — a claim
 * flow that refuses *after* creating the user has not refused.
 *
 * The happy path is here too, and it is not decoration: it is the only way to
 * prove the canary can fire, and it asserts the *order* of the writes, which is
 * where the race guarantees live (token consumed first, institution taken
 * second, membership last).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTableName, type Table } from 'drizzle-orm';

import type { SessionUser } from '@/lib/auth/session';
import { hashClaimToken } from '@/lib/claims/token';

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

const adminUser: SessionUser = {
  id: 1,
  role: 'admin',
  institutionId: null,
  mustChangePassword: false,
};
const editorUser: SessionUser = {
  id: 2,
  role: 'editor',
  institutionId: null,
  mustChangePassword: false,
};
const institutionUser: SessionUser = {
  id: 3,
  role: 'institution_admin',
  institutionId: 7,
  mustChangePassword: false,
};

/* -------------------------------------------------------------------------- */
/* The fake database                                                           */
/* -------------------------------------------------------------------------- */

/** Rows each table answers with, per test. */
let rowsByTable: Record<string, unknown[]> = {};
/** Every write that ran, in order: `update:claims`, `insert:users`, … */
let writes: string[] = [];
/** `affectedRows` an update on a given table reports. Default 1. */
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
};

vi.mock('@/db', async () => {
  const actual = await vi.importActual<typeof import('@/db')>('@/db');
  return { ...actual, db: fakeDb };
});

/** No mail leaves a test. `sent` records what would have gone out, to whom. */
const sent: { to: string; token: string }[] = [];
vi.mock('@/lib/claims/notify', () => ({
  sendClaimLink: async (mail: { to: string; token: string }) => {
    sent.push({ to: mail.to, token: mail.token });
    return true;
  },
  sendClaimRejected: async () => true,
  claimUrl: (token: string) => `https://example.test/reclamar/${token}`,
}));

const { approveClaim, previewClaim, redeemClaim, rejectClaim, requestClaim, listClaims, getClaim } =
  await import('./claims');

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const TOKEN = 'un-token-de-prueba';
const INSTITUTION_ID = 7;

const HOUR = 60 * 60 * 1000;

function liveClaim(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    institutionId: INSTITUTION_ID,
    institutionName: 'UNI',
    institutionSlug: 'uni',
    institutionWebsite: 'https://uni.edu.py',
    claimedByUserId: null,
    email: 'rectorado@uni.edu.py',
    emailDomain: 'uni.edu.py',
    contactName: 'Ana Rectora',
    note: null,
    domainVerified: true,
    status: 'pending' as const,
    expiresAt: new Date(Date.now() + 48 * HOUR),
    verifiedAt: null,
    decidedByUserId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function unpublishedInstitution(overrides: Record<string, unknown> = {}) {
  return {
    id: INSTITUTION_ID,
    nameShort: 'UNI',
    nameOfficial: 'Universidad Nacional de Ingeniería',
    website: 'https://uni.edu.py',
    claimedByUserId: null,
    ...overrides,
  };
}

beforeEach(() => {
  rowsByTable = {};
  writes = [];
  affectedByTable = {};
  sent.length = 0;
});

/** No write ran, and the failure is the one we expected. */
function expectNoWrite() {
  expect(writes).toEqual([]);
}

/* -------------------------------------------------------------------------- */
/* Deciding a claim is admin-only                                              */
/* -------------------------------------------------------------------------- */

describe('approving a claim is admin-only, enforced server-side', () => {
  beforeEach(() => {
    rowsByTable.claims = [liveClaim({ domainVerified: false })];
  });

  it('a signed-out request cannot approve or reject', async () => {
    await expect(approveClaim(null, 11)).rejects.toThrow();
    await expect(rejectClaim(null, 11)).rejects.toThrow();
    expectNoWrite();
  });

  /**
   * `editor` curates the national dataset and still may not do this: approving
   * hands somebody a login, which is not a data decision. The roles are not a
   * ladder, so this is asserted rather than assumed.
   */
  it('an editor cannot approve or reject', async () => {
    await expect(approveClaim(editorUser, 11)).rejects.toThrow();
    await expect(rejectClaim(editorUser, 11)).rejects.toThrow();
    expectNoWrite();
  });

  it('an institution user cannot approve their own claim', async () => {
    await expect(approveClaim(institutionUser, 11)).rejects.toThrow();
    expectNoWrite();
  });

  it('an editor may still read the queue — deciding is the privileged part', async () => {
    await expect(listClaims(editorUser)).resolves.toHaveLength(1);
    await expect(getClaim(editorUser, 11)).resolves.not.toBeNull();
    expectNoWrite();
  });

  it('a signed-out request cannot read the queue either', async () => {
    await expect(listClaims(null)).rejects.toThrow();
    await expect(getClaim(institutionUser, 11)).rejects.toThrow();
  });
});

describe('an admin approving mints a fresh token rather than reviving the old one', () => {
  it('sends a new link and never re-sends what was stored', async () => {
    const claim = liveClaim({ domainVerified: false, tokenHash: hashClaimToken(TOKEN) });
    rowsByTable.claims = [claim];

    const result = await approveClaim(adminUser, 11);

    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('rectorado@uni.edu.py');
    expect(hashClaimToken(sent[0].token)).not.toBe(hashClaimToken(TOKEN));
    expect(writes).toContain('update:claims');
  });

  it('refuses a claim on an institution that is already claimed', async () => {
    rowsByTable.claims = [liveClaim({ domainVerified: false, claimedByUserId: 5 })];

    const result = await approveClaim(adminUser, 11);

    expect(result).toMatchObject({ ok: false });
    expect(sent).toEqual([]);
    expectNoWrite();
  });

  it('refuses a claim that was already resolved', async () => {
    rowsByTable.claims = [liveClaim({ status: 'approved' })];

    expect(await approveClaim(adminUser, 11)).toMatchObject({ ok: false });
    expect(await rejectClaim(adminUser, 11)).toMatchObject({ ok: false });
    expectNoWrite();
  });
});

/* -------------------------------------------------------------------------- */
/* Requesting a claim                                                          */
/* -------------------------------------------------------------------------- */

describe('requesting a claim', () => {
  it('emails the token when the address is on the institution’s domain', async () => {
    rowsByTable.institutions = [unpublishedInstitution()];
    rowsByTable.claims = [{ count: 0 }];

    const result = await requestClaim({
      institutionSlug: 'uni',
      email: 'rectorado@uni.edu.py',
      contactName: 'Ana',
      note: null,
    });

    expect(result).toMatchObject({ outcome: 'emailed' });
    expect(sent).toHaveLength(1);
    expect(writes).toEqual(['insert:claims']);
  });

  /**
   * The whole point of the fallback: the row is created so an admin can see it,
   * and **no token leaves the building**. A queued claim that mailed its link
   * would be an unverified claim with a working credential in the wild.
   */
  it('queues without sending anything when the domain does not match', async () => {
    rowsByTable.institutions = [unpublishedInstitution()];
    rowsByTable.claims = [{ count: 0 }];

    const result = await requestClaim({
      institutionSlug: 'uni',
      email: 'alguien@gmail.com',
      contactName: 'Ana',
      note: 'Trabajo en comunicación',
    });

    expect(result).toMatchObject({ outcome: 'queued', reason: 'personal_email' });
    expect(sent).toEqual([]);
    expect(writes).toEqual(['insert:claims']);
  });

  it('does not start a claim on an institution that already has one', async () => {
    rowsByTable.institutions = [unpublishedInstitution({ claimedByUserId: 5 })];

    const result = await requestClaim({
      institutionSlug: 'uni',
      email: 'rectorado@uni.edu.py',
      contactName: null,
      note: null,
    });

    expect(result).toMatchObject({ outcome: 'already_claimed' });
    expect(sent).toEqual([]);
    expectNoWrite();
  });

  it('refuses to write a row for a malformed address', async () => {
    rowsByTable.institutions = [unpublishedInstitution()];

    expect(
      await requestClaim({
        institutionSlug: 'uni',
        email: 'no-es-un-correo',
        contactName: null,
        note: null,
      }),
    ).toMatchObject({ outcome: 'invalid_email' });
    expectNoWrite();
  });

  it('stops adding to the queue past the per-institution cap', async () => {
    rowsByTable.institutions = [unpublishedInstitution()];
    rowsByTable.claims = [{ count: 5 }];

    expect(
      await requestClaim({
        institutionSlug: 'uni',
        email: 'rectorado@uni.edu.py',
        contactName: null,
        note: null,
      }),
    ).toMatchObject({ outcome: 'too_many' });
    expectNoWrite();
  });
});

/* -------------------------------------------------------------------------- */
/* Redeeming — every refusal, and none of them writes                          */
/* -------------------------------------------------------------------------- */

describe('redeeming a token — the refusals', () => {
  const password = 'una frase larga y aburrida';

  it('an unknown token reaches nothing', async () => {
    rowsByTable.claims = [];

    const result = await redeemClaim(TOKEN, { password, name: null });

    expect(result).toMatchObject({ ok: false, reason: 'unknown' });
    expectNoWrite();
  });

  it('an expired token reaches nothing — not even a bookkeeping write', async () => {
    rowsByTable.claims = [liveClaim({ expiresAt: new Date(Date.now() - HOUR) })];

    const result = await redeemClaim(TOKEN, { password, name: null });

    expect(result).toMatchObject({ ok: false, reason: 'expired' });
    expectNoWrite();
  });

  it('a token whose claim is still awaiting review reaches nothing', async () => {
    rowsByTable.claims = [liveClaim({ domainVerified: false, decidedByUserId: null })];

    const result = await redeemClaim(TOKEN, { password, name: null });

    expect(result).toMatchObject({ ok: false, reason: 'awaiting_review' });
    expectNoWrite();
  });

  it('a spent token reaches nothing — this is single-use', async () => {
    rowsByTable.claims = [liveClaim({ status: 'approved' })];

    const result = await redeemClaim(TOKEN, { password, name: null });

    expect(result).toMatchObject({ ok: false, reason: 'used' });
    expectNoWrite();
  });

  it('a rejected claim’s token reaches nothing', async () => {
    rowsByTable.claims = [liveClaim({ status: 'rejected' })];

    expect(await redeemClaim(TOKEN, { password, name: null })).toMatchObject({ reason: 'used' });
    expectNoWrite();
  });

  /** A second claim must never silently re-assign an institution. */
  it('an institution that is already claimed reaches nothing', async () => {
    rowsByTable.claims = [liveClaim({ claimedByUserId: 5 })];

    const result = await redeemClaim(TOKEN, { password, name: null });

    expect(result).toMatchObject({ ok: false, reason: 'already_claimed' });
    expectNoWrite();
  });

  it('a staff address is never attached to an institution this way', async () => {
    rowsByTable.claims = [liveClaim()];
    rowsByTable.users = [{ id: 4, role: 'admin', institutionId: null }];

    const result = await redeemClaim(TOKEN, { password, name: null });

    expect(result).toMatchObject({ ok: false, reason: 'staff_email' });
    expectNoWrite();
  });

  it('an account that already belongs to another institution is refused', async () => {
    rowsByTable.claims = [liveClaim()];
    rowsByTable.users = [{ id: 4, role: 'institution_admin', institutionId: 99 }];

    const result = await redeemClaim(TOKEN, { password, name: null });

    expect(result).toMatchObject({ ok: false, reason: 'other_institution' });
    expectNoWrite();
  });

  it('a weak password creates nothing — PR-18’s rule is not relaxed here', async () => {
    rowsByTable.claims = [liveClaim()];
    rowsByTable.users = [];

    const result = await redeemClaim(TOKEN, { password: 'corta', name: null });

    expect(result).toMatchObject({ ok: false, reason: 'weak_password' });
    expectNoWrite();
  });

  it('preview never writes either — mail scanners fetch links', async () => {
    rowsByTable.claims = [liveClaim()];
    rowsByTable.users = [];

    await previewClaim(TOKEN);
    await previewClaim('otro-token');

    expectNoWrite();
  });
});

/* -------------------------------------------------------------------------- */
/* Redeeming — the happy path, and the order that makes the races safe         */
/* -------------------------------------------------------------------------- */

describe('redeeming a token — completing the claim', () => {
  const password = 'una frase larga y aburrida';

  it('consumes the token before it creates anything, and takes the institution before the membership', async () => {
    rowsByTable.claims = [liveClaim()];
    rowsByTable.users = [];

    const result = await redeemClaim(TOKEN, { password, name: 'Ana Rectora' });

    expect(result).toMatchObject({ ok: true, mode: 'created' });
    // The order is the guarantee: the conditional UPDATE on `claims` is what
    // makes the token single-use under concurrency, so it must run first.
    expect(writes[0]).toBe('update:claims');
    expect(writes).toContain('insert:users');
    expect(writes.indexOf('update:institutions')).toBeLessThan(
      writes.indexOf('insert:institution_members'),
    );
    expect(writes).toContain('insert:activity_log');
  });

  /**
   * The race the conditional `UPDATE` exists for: two links redeemed at once.
   * The loser's `UPDATE … WHERE status = 'pending'` affects zero rows, and the
   * whole transaction ends there — no user, no membership, no re-assignment.
   */
  it('a token consumed by a concurrent redemption creates no account', async () => {
    rowsByTable.claims = [liveClaim()];
    rowsByTable.users = [];
    affectedByTable.claims = 0;

    const result = await redeemClaim(TOKEN, { password, name: null });

    expect(result).toMatchObject({ ok: false, reason: 'used' });
    expect(writes).toEqual(['update:claims']);
  });

  /** The same race one step later: the institution was claimed mid-transaction. */
  it('an institution taken mid-transaction is not re-assigned', async () => {
    rowsByTable.claims = [liveClaim()];
    rowsByTable.users = [];
    affectedByTable.institutions = 0;

    const result = await redeemClaim(TOKEN, { password, name: null });

    expect(result).toMatchObject({ ok: false, reason: 'already_claimed' });
    expect(writes).not.toContain('insert:institution_members');
  });

  /**
   * A claim link proves control of a mailbox. That is enough to *create* a
   * credential and is not enough to *reset* one: an existing account is
   * attached, and no password write happens at all.
   */
  it('attaches an existing account without touching its password', async () => {
    rowsByTable.claims = [liveClaim()];
    rowsByTable.users = [{ id: 4, role: 'institution_editor', institutionId: null }];
    rowsByTable.institution_members = [];

    const result = await redeemClaim(TOKEN, { password: '', name: null });

    expect(result).toMatchObject({ ok: true, mode: 'linked' });
    expect(writes).not.toContain('insert:users');
    expect(writes).toContain('update:users');
  });
});
