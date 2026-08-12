/**
 * **The acceptance bar for PR-21.**
 *
 * > *an institution user cannot read or write any other institution's data —
 * > verified by a test that attempts it directly against the route handlers,
 * > not just the UI*
 *
 * So this file does not check that a link is hidden. It builds a session for
 * institution **B** and calls the real server actions from
 * `src/app/panel/actions.ts` with ids owned by institution **A**, and asserts
 * every one of them refuses before a write happens.
 *
 * ### Nothing in the security path is mocked
 *
 * Only the database is replaced, with one that answers every ownership lookup
 * "institution A owns this row" — the most dangerous possible answer, because
 * it means the row really exists and really is somebody else's. The real
 * `assertOwnsProgram`, `programInstitutionId`, `assertSameInstitution` and
 * `scopeToInstitution` all run.
 *
 * Reads are allowed, because resolving ownership *is* the guard. Writes are the
 * canary: an `insert`, `update`, `delete`, transaction or index rebuild on a
 * cross-institution request sets `dbWrote`, and every assertion checks it.
 * Asserting only "an error came back" would pass with the guard deleted, since
 * every action catches its own errors — that version of this test was written
 * first and did exactly that.
 *
 * `next/cache` is stubbed because `revalidatePath` needs a request scope that
 * does not exist in vitest, and it only ever runs *after* a successful write —
 * so a test that reaches it has already failed its assertion.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@/lib/auth/session';

const INSTITUTION_A = 1;
const INSTITUTION_B = 2;

/** Every id in this test belongs to institution A. */
const OWNED_BY_A = 100;

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

const unscopedUser: SessionUser = {
  id: 43,
  role: 'institution_editor',
  institutionId: null,
  mustChangePassword: false,
};

let sessionUser: SessionUser | null = userOfB;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/session')>('@/lib/auth/session');
  return { ...actual, currentUser: async () => sessionUser };
});

/**
 * A fake database, so that **nothing in the security path is mocked**.
 *
 * The first version of this file stubbed the ownership lookups in
 * `./scope`. That was wrong twice over: `assertOwnsProgram` calls its
 * module-local reference rather than the mocked export, so the stub did not
 * even apply — and if it had, it would have been mocking half of the rule under
 * test. What runs below is the real `assertOwnsProgram`, the real
 * `programInstitutionId`, the real `assertSameInstitution` and the real
 * `scopeToInstitution`, against a database that answers.
 *
 * **Reads are allowed; writes are the canary.** Resolving who owns a row is a
 * legitimate read — it is how the guard works. What must never happen on a
 * cross-institution request is an `insert`, an `update`, a `delete` or a
 * transaction, so those set `dbWrote` and throw. Deleting the guard makes
 * `dbWrote` true and this file red, which is the property that makes it a test
 * rather than a decoration.
 */
let dbWrote = false;

/** Every ownership lookup answers "institution A owns it" — the dangerous case. */
const OWNER_ROW = [{ institutionId: INSTITUTION_A, programId: 7, id: OWNED_BY_A }];

function selectChain(rows: unknown[]): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: unknown) => void) => resolve(rows);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

function refuseWrite(): never {
  dbWrote = true;
  throw new Error('SECURITY: a write ran after an authorization check should have refused.');
}

vi.mock('@/db', async () => {
  const actual = await vi.importActual<typeof import('@/db')>('@/db');
  const fake = {
    select: () => selectChain(OWNER_ROW),
    insert: refuseWrite,
    update: refuseWrite,
    delete: refuseWrite,
    transaction: refuseWrite,
  };
  return { ...actual, db: fake };
});

/** The rebuild is a write path of its own; reaching it is the same failure. */
vi.mock('@/db/queries/rebuild-search', () => ({
  rebuildProgramSearch: async () => {
    dbWrote = true;
    throw new Error('SECURITY: the search index was rebuilt after a refused request.');
  },
}));

const {
  savePanelProgramAction,
  savePanelOfferingAction,
  savePanelPriceAction,
  savePanelAdmissionAction,
  createPanelAdmissionAction,
  inviteMemberAction,
  changeMemberRoleAction,
  removeMemberAction,
  setPanelLeadStatusAction,
  fileAccreditationDisputeAction,
} = await import('@/app/panel/actions');

const { assertSameInstitution, panelInstitutionId, requirePanelAdmin } = await import('./scope');

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

/**
 * The assertion every cross-institution case makes.
 *
 * Three things have to hold together, and any one of them alone is weak:
 * the action reported a failure, it reported the **authorization** failure
 * rather than an incidental one, and **no query ran**.
 */
function expectRefused(state: { error?: string; message?: string }) {
  expect(state.message).toBeUndefined();
  expect(state.error).toBeTruthy();
  // Not an incidental failure dressed up as a refusal.
  expect(state.error).not.toMatch(/SECURITY/);
  expect(state.error).toMatch(/permiso|sesión|institución|panel/i);
  // The assertion that actually has teeth.
  expect(dbWrote).toBe(false);
}

beforeEach(() => {
  sessionUser = userOfB;
  dbWrote = false;
});

/* -------------------------------------------------------------------------- */

describe('cross-institution writes, against the route handlers', () => {
  it('refuses to edit another institution’s programme', async () => {
    expectRefused(await savePanelProgramAction(OWNED_BY_A, {}, form({ descriptionMd: 'hola' })));
  });

  it('refuses to edit another institution’s offering', async () => {
    expectRefused(
      await savePanelOfferingAction(
        OWNED_BY_A,
        {},
        form({ planUrl: 'https://example.py/plan.pdf' }),
      ),
    );
  });

  /**
   * The one that would matter most: publishing a price onto somebody else's
   * carrera puts a number we cannot defend on a page we do not own.
   */
  it('refuses to publish a price on another institution’s offering', async () => {
    expectRefused(
      await savePanelPriceAction(
        OWNED_BY_A,
        {},
        form({ monthlyFee: '1450000', installmentsPerYear: '10' }),
      ),
    );
  });

  it('refuses to edit another institution’s convocatoria', async () => {
    expectRefused(
      await savePanelAdmissionAction(OWNED_BY_A, {}, form({ periodLabel: 'Convocatoria 2027' })),
    );
  });

  it('refuses to create a convocatoria under another institution’s programme', async () => {
    expectRefused(
      await createPanelAdmissionAction(OWNED_BY_A, {}, form({ periodLabel: 'Convocatoria 2027' })),
    );
  });

  it('refuses to change the status of another institution’s lead', async () => {
    expectRefused(
      await setPanelLeadStatusAction(OWNED_BY_A, {}, form({ status: 'contacted' })),
    );
  });

  it('refuses to file a dispute on another institution’s accreditation', async () => {
    expectRefused(
      await fileAccreditationDisputeAction(
        OWNED_BY_A,
        7,
        {},
        form({ reason: 'Esta acreditación ya no está vigente, tenemos una nueva resolución.' }),
      ),
    );
  });
});

describe('a signed-out request reaches nothing', () => {
  beforeEach(() => {
    sessionUser = null;
  });

  it('every panel action refuses, and none of them writes', async () => {
    expectRefused(await savePanelProgramAction(1, {}, form()));
    expectRefused(await savePanelOfferingAction(1, {}, form()));
    expectRefused(await savePanelPriceAction(1, {}, form()));
    expectRefused(await savePanelAdmissionAction(1, {}, form()));
    expectRefused(await inviteMemberAction({}, form({ email: 'x@y.py' })));
    expectRefused(await changeMemberRoleAction(1, {}, form()));
    expectRefused(await removeMemberAction(1, {}));
    expectRefused(await setPanelLeadStatusAction(1, {}, form({ status: 'contacted' })));
    expectRefused(
      await fileAccreditationDisputeAction(1, 7, {}, form({ reason: 'Motivo suficientemente largo.' })),
    );
  });
});

describe('staff do not get an institution by default', () => {
  beforeEach(() => {
    sessionUser = staffUser;
  });

  /**
   * `/panel` renders one institution's data with "your" wording throughout. A
   * staff session has no institution, so rather than silently picking one — or
   * worse, matching every one — it is refused and sent to `/admin`, which asks
   * which institution explicitly.
   */
  it('an admin is refused at the panel boundary rather than scoped to everything', async () => {
    expectRefused(await savePanelPriceAction(OWNED_BY_A, {}, form({ monthlyFee: '1' })));
    expect(() => panelInstitutionId(staffUser)).toThrow();
  });
});

describe('an institution role with no institution attached', () => {
  beforeEach(() => {
    sessionUser = unscopedUser;
  });

  it('reaches nothing — this is the invited-but-unassigned state', async () => {
    expectRefused(await savePanelProgramAction(OWNED_BY_A, {}, form()));
    expect(() => panelInstitutionId(unscopedUser)).toThrow();
  });
});

describe('member management is institution_admin only', () => {
  const editorOfB: SessionUser = {
    id: 44,
    role: 'institution_editor',
    institutionId: INSTITUTION_B,
    mustChangePassword: false,
  };

  beforeEach(() => {
    sessionUser = editorOfB;
  });

  it('an institution_editor cannot invite, promote or remove', async () => {
    expectRefused(await inviteMemberAction({}, form({ email: 'nuevo@uni.py' })));
    expectRefused(await changeMemberRoleAction(9, {}, form({ role: 'institution_admin' })));
    expectRefused(await removeMemberAction(9, {}));
    expect(() => requirePanelAdmin(editorOfB)).toThrow();
  });

  it('but may still read and edit data — the roles are not a ladder', () => {
    expect(panelInstitutionId(editorOfB)).toBe(INSTITUTION_B);
  });
});

/* -------------------------------------------------------------------------- */

describe('assertSameInstitution — the rule itself', () => {
  it('returns the scope when the row is the session’s own', () => {
    expect(assertSameInstitution(userOfB, INSTITUTION_B)).toBe(INSTITUTION_B);
  });

  it('throws for another institution’s row', () => {
    expect(() => assertSameInstitution(userOfB, INSTITUTION_A)).toThrow();
  });

  /**
   * A row that does not exist and a row that belongs to somebody else answer
   * identically. Distinguishing them turns the URL space into an oracle for
   * which ids are real.
   */
  it('throws the same way for a row that does not exist', () => {
    expect(() => assertSameInstitution(userOfB, null)).toThrow();
    expect(() => assertSameInstitution(userOfB, undefined)).toThrow();
  });

  it('throws for a signed-out request', () => {
    expect(() => assertSameInstitution(null, INSTITUTION_B)).toThrow();
  });

  it('does not treat 0 as a wildcard', () => {
    expect(() => assertSameInstitution(userOfB, 0)).toThrow();
  });
});
