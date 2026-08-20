/**
 * The two guards that live in the action rather than in the query (PR-44).
 *
 * `requireRole` is in `db/queries/admin/personal-data.ts` and is tested there.
 * What is only here is the **confirmation**, and what the action's result may
 * carry. Both are asserted against the real action, with the query mocked so a
 * failure to refuse is visible as a call rather than as an absence of one.
 *
 * "The details never reach a URL" is a property of the *shape* — the actions
 * take a `FormData` and return a value, and there is no redirect and no
 * `searchParams` anywhere in the module — not something a unit test can observe.
 * It is stated in `actions.ts` and in `risks.md` §R-06 as a design decision
 * rather than claimed here as a tested one.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const findLeadsByContact = vi.fn();
const deleteLeadsByContact = vi.fn();
const countAllLeads = vi.fn();

vi.mock('@/db/queries/admin/personal-data', async () => {
  const actual = await vi.importActual<typeof import('@/db/queries/admin/personal-data')>(
    '@/db/queries/admin/personal-data',
  );
  return {
    ...actual,
    findLeadsByContact: (...args: unknown[]) => findLeadsByContact(...args),
    deleteLeadsByContact: (...args: unknown[]) => deleteLeadsByContact(...args),
    countAllLeads: (...args: unknown[]) => countAllLeads(...args),
  };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/session')>('@/lib/auth/session');
  return {
    ...actual,
    currentUser: async () => ({
      id: 1,
      role: 'admin' as const,
      institutionId: null,
      mustChangePassword: false,
    }),
  };
});

const { deletePersonalDataAction, findPersonalDataAction } = await import('./actions');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  findLeadsByContact.mockResolvedValue([]);
  deleteLeadsByContact.mockResolvedValue({ deleted: 2, keyHash: 'a'.repeat(32) });
  countAllLeads.mockResolvedValue(1240);
});

describe('findPersonalDataAction', () => {
  it('refuses an empty request before it queries', async () => {
    const state = await findPersonalDataAction({}, form({ phone: '', email: '' }));
    expect(state.error).toBeTruthy();
    expect(findLeadsByContact, 'an empty key would match every lead').not.toHaveBeenCalled();
  });

  it('refuses an unparseable phone before it queries', async () => {
    const state = await findPersonalDataAction({}, form({ phone: 'llamame' }));
    expect(state.error).toBeTruthy();
    expect(findLeadsByContact).not.toHaveBeenCalled();
  });

  it('passes the normalised key, not what was typed', async () => {
    await findPersonalDataAction({}, form({ phone: '0981 123 456' }));
    expect(findLeadsByContact).toHaveBeenCalledWith(expect.anything(), {
      phoneE164: '+595981123456',
      email: null,
    });
  });
});

describe('deletePersonalDataAction', () => {
  it('refuses without the confirmation, and deletes nothing', async () => {
    const state = await deletePersonalDataAction({}, form({ phone: '0981123456' }));
    expect(state.error).toBeTruthy();
    expect(state.deleted).toBeUndefined();
    expect(deleteLeadsByContact).not.toHaveBeenCalled();
  });

  it('refuses an empty key even with the confirmation ticked', async () => {
    // The checkbox is a statement about the request, not about the key. Ticking
    // it must not turn "delete nothing in particular" into a query.
    const state = await deletePersonalDataAction({}, form({ confirm: 'on' }));
    expect(state.error).toBeTruthy();
    expect(deleteLeadsByContact).not.toHaveBeenCalled();
  });

  it('deletes once both are present, and reports the count', async () => {
    const state = await deletePersonalDataAction({}, form({ phone: '0981123456', confirm: 'on' }));
    expect(deleteLeadsByContact).toHaveBeenCalledTimes(1);
    expect(state.deleted).toBe(2);
    expect(state.error).toBeUndefined();
  });

  it('never returns the key hash to the browser', async () => {
    // It is an audit-log identifier for the operator's records, not something
    // the screen needs; shipping it would invite it into a URL or a screenshot.
    const state = await deletePersonalDataAction({}, form({ phone: '0981123456', confirm: 'on' }));
    expect(JSON.stringify(state)).not.toContain('a'.repeat(32));
  });

  it('reports a refusal from the query rather than pretending it worked', async () => {
    deleteLeadsByContact.mockRejectedValue(new Error('No tenés permiso para esto.'));
    const state = await deletePersonalDataAction({}, form({ phone: '0981123456', confirm: 'on' }));
    expect(state.deleted).toBeUndefined();
    expect(state.error).toBe('No tenés permiso para esto.');
  });
});
