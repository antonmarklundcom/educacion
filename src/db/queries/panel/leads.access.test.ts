/**
 * PR-23's two load-bearing promises, neither of which had a test (PR-46).
 *
 * The independent review of PR-23 mutation-tested both and found the suite
 * green either way:
 *
 * - **The free-plan redaction** — "free-plan institutions see counts but not
 *   contact details", the criterion the whole plan matrix rests on. Replacing
 *   every `contactVisible ? x : null` with `x`, so a free institution's inbox,
 *   detail page and CSV all showed name, phone, email and message, passed
 *   1084/1084.
 * - **`getPanelLead`'s ownership guard** — the *read* half of §15.2. Replacing
 *   `assertOwnsLead` with a bare `panelInstitutionId`, so `/panel/leads/<A's
 *   id>` rendered A's lead to B, also passed 1084/1084. (The *write* half is
 *   pinned: the same mutation on `setPanelLeadStatus` turns `access.test.ts`
 *   red. It was only ever the read side that was uncovered.)
 *
 * Only the database and the entitlement lookup are replaced. The real
 * `panelInstitutionId`, the real `assertSameInstitution` and the real
 * `shapeRow` all run.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { freeEntitlements, type Entitlements } from '@/lib/entitlements';
import type { SessionUser } from '@/lib/auth/session';

const INSTITUTION_A = 1;
const INSTITUTION_B = 2;
const LEAD_OF_A = 100;

const userOfA: SessionUser = {
  id: 41,
  role: 'institution_admin',
  institutionId: INSTITUTION_A,
  mustChangePassword: false,
};
const userOfB: SessionUser = { ...userOfA, id: 42, institutionId: INSTITUTION_B };

/** What `getEntitlements` answers. Swapped per test. */
let entitlements: Entitlements = freeEntitlements(INSTITUTION_A);

vi.mock('@/lib/entitlements', async () => {
  const actual = await vi.importActual<typeof import('@/lib/entitlements')>('@/lib/entitlements');
  return { ...actual, getEntitlements: async () => entitlements };
});

/** One lead, belonging to institution A, with every contact field populated. */
const LEAD = {
  id: LEAD_OF_A,
  institutionId: INSTITUTION_A,
  offeringId: 7,
  name: 'Ana Estudiante',
  phoneE164: '+595981123456',
  email: 'ana@example.com',
  message: 'Quiero información sobre la carrera',
  status: 'new' as const,
  ageBracket: '18_mas' as const,
  sourcePage: '/universidades/una/medicina',
  createdAt: new Date('2026-08-01T12:00:00Z'),
  deliveredAt: null,
  consentTextVersion: 'v1',
  consentAt: new Date('2026-08-01T12:00:00Z'),
};

const SECRETS = ['Ana Estudiante', '+595981123456', 'ana@example.com', 'Quiero información'];

let dbWrote = false;

function chain(rows: unknown[]): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (value: unknown) => void) => resolve(rows);
        return () => proxy;
      },
    },
  );
  return proxy;
}

/**
 * Every select answers with the lead — including the ownership lookup, which
 * therefore truthfully says "institution A owns this". That is the dangerous
 * answer: the row exists and is somebody else's.
 */
// A function declaration, not a `const`: `vi.mock`'s factory is hoisted above
// every static import, and the entitlements import below reaches `@/db`
// through `queries/plans` while it runs.
function fakeDb(): Record<string, unknown> {
  return {
    select: () => chain([{ ...LEAD, total: 1, programName: 'Medicina' }]),
    insert: () => {
      dbWrote = true;
      return chain([]);
    },
    update: () => {
      dbWrote = true;
      return chain([]);
    },
    delete: () => {
      dbWrote = true;
      return chain([]);
    },
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(fakeDb()),
  };
}

vi.mock('@/db', async () => {
  const actual = await vi.importActual<typeof import('@/db')>('@/db');
  return { ...actual, db: fakeDb() };
});

const { getPanelLead, listPanelLeads, listPanelLeadsForExport } = await import('./leads');

beforeEach(() => {
  dbWrote = false;
  entitlements = freeEntitlements(INSTITUTION_A);
});

/** The paid answer: same shape, `lead_contacts` on. */
function paid(): Entitlements {
  const free = freeEntitlements(INSTITUTION_A);
  return { ...free, features: { ...free.features, lead_contacts: true } };
}

/* -------------------------------------------------------------------------- */
/* The free-plan redaction — PR-23 acceptance criterion 4                     */
/* -------------------------------------------------------------------------- */

describe('a free plan sees counts, never contact details', () => {
  it('redacts the inbox list', async () => {
    const { rows, total } = await listPanelLeads(userOfA);
    expect(total, 'the count is not redacted — that is what a free plan buys').toBe(1);
    expect(rows[0].name).toBeNull();
    expect(rows[0].phoneE164).toBeNull();
    expect(rows[0].email).toBeNull();
    expect(rows[0].message).toBeNull();
    for (const secret of SECRETS) expect(JSON.stringify(rows)).not.toContain(secret);
  });

  it('redacts the detail page', async () => {
    const lead = await getPanelLead(userOfA, LEAD_OF_A);
    for (const secret of SECRETS) expect(JSON.stringify(lead)).not.toContain(secret);
  });

  it('redacts the CSV export', async () => {
    // The surface a redaction is most likely to be forgotten on: a second code
    // path that reads the same rows.
    const { rows, contactVisible } = await listPanelLeadsForExport(userOfA);
    expect(contactVisible).toBe(false);
    for (const secret of SECRETS) expect(JSON.stringify(rows)).not.toContain(secret);
  });

  it('keeps everything that is not a contact detail', async () => {
    // Redaction, not removal: the lead is still a workable row.
    const { rows } = await listPanelLeads(userOfA);
    expect(rows[0].id).toBe(LEAD_OF_A);
    expect(rows[0].status).toBe('new');
    expect(rows[0].ageBracket).toBe('18_mas');
    expect(rows[0].sourcePage).toBe('/universidades/una/medicina');
  });
});

describe('a paid plan sees them', () => {
  beforeEach(() => {
    entitlements = paid();
  });

  it('shows the contact details on all three surfaces', async () => {
    const { rows } = await listPanelLeads(userOfA);
    expect(rows[0].phoneE164).toBe('+595981123456');
    expect((await getPanelLead(userOfA, LEAD_OF_A))?.email).toBe('ana@example.com');
    expect((await listPanelLeadsForExport(userOfA)).contactVisible).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Ownership — PR-23 acceptance criteria 1 and 2                              */
/* -------------------------------------------------------------------------- */

describe('a lead belongs to one institution', () => {
  it('refuses to read another institution’s lead by id', async () => {
    // §15.2's read half. The fake database answers "institution A owns this",
    // so the guard is the only thing standing between B and A's data.
    await expect(getPanelLead(userOfB, LEAD_OF_A)).rejects.toThrow();
    expect(dbWrote).toBe(false);
  });

  it('answers the same way for a lead that does not exist', async () => {
    // `scope.ts` promises a missing row and somebody else's row are
    // indistinguishable — otherwise the detail route is an existence oracle.
    entitlements = paid();
    await expect(getPanelLead(userOfB, 999_999)).rejects.toThrow();
  });

  it('lets the owner read it', async () => {
    entitlements = paid();
    await expect(getPanelLead(userOfA, LEAD_OF_A)).resolves.toBeTruthy();
  });

  it('refuses a session with no institution at all', async () => {
    const unscoped: SessionUser = { ...userOfA, institutionId: null };
    await expect(listPanelLeads(unscoped)).rejects.toThrow();
    await expect(listPanelLeadsForExport(unscoped)).rejects.toThrow();
    await expect(getPanelLead(unscoped, LEAD_OF_A)).rejects.toThrow();
  });

  it('refuses a signed-out request', async () => {
    await expect(listPanelLeads(null)).rejects.toThrow();
    await expect(listPanelLeadsForExport(null)).rejects.toThrow();
    await expect(getPanelLead(null, LEAD_OF_A)).rejects.toThrow();
  });
});
