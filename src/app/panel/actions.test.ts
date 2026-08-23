/**
 * The `/panel` actions' wiring (PR-51).
 *
 * `db/queries/panel/access.test.ts` already proves the *query* functions refuse
 * another institution's ids. What nothing proved is the layer above: that each
 * action reads the session server-side, hands it to that query, and hands the
 * form's values through unchanged. A mis-wired argument — the id and the
 * payload swapped, a field read under the wrong name, `currentUser()` dropped
 * for a literal — passes every existing test.
 *
 * So the query layer is the mock here and the assertions are about what reaches
 * it. The three properties, from `pr-plan.md` PR-51: **auth refused**,
 * **malformed input refused**, **arguments reach the query function intact**.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';

const savePanelPrice = vi.fn();
const savePanelProgram = vi.fn();
const setPanelLeadStatus = vi.fn();
const assertOwnsOffering = vi.fn();
const fileAccreditationDispute = vi.fn();

let sessionUser: SessionUser | null = {
  id: 12,
  role: 'institution_admin',
  institutionId: 3,
  mustChangePassword: false,
};

vi.mock('@/lib/auth/session', () => ({ currentUser: async () => sessionUser }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/db/queries/panel/edits', () => ({
  savePanelPrice: (...a: unknown[]) => savePanelPrice(...a),
  savePanelProgram: (...a: unknown[]) => savePanelProgram(...a),
  savePanelOffering: vi.fn(),
  savePanelAdmission: vi.fn(),
  createPanelAdmission: vi.fn(),
}));
vi.mock('@/db/queries/panel/members', () => ({
  inviteMember: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
}));
vi.mock('@/db/queries/panel/leads', () => ({
  setPanelLeadStatus: (...a: unknown[]) => setPanelLeadStatus(...a),
}));
vi.mock('@/db/queries/panel/scope', () => ({
  assertOwnsOffering: (...a: unknown[]) => assertOwnsOffering(...a),
}));
vi.mock('@/db/queries/panel/disputes', () => ({
  fileAccreditationDispute: (...a: unknown[]) => fileAccreditationDispute(...a),
}));

const {
  fileAccreditationDisputeAction,
  savePanelPriceAction,
  savePanelProgramAction,
  setPanelLeadStatusAction,
} = await import('./actions');

const OK = { message: 'Guardamos los cambios.', rejected: [] };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  sessionUser = { id: 12, role: 'institution_admin', institutionId: 3, mustChangePassword: false };
  savePanelPrice.mockReset().mockResolvedValue(OK);
  savePanelProgram.mockReset().mockResolvedValue(OK);
  setPanelLeadStatus.mockReset().mockResolvedValue(undefined);
  assertOwnsOffering.mockReset().mockResolvedValue(3);
  fileAccreditationDispute.mockReset().mockResolvedValue(undefined);
});

describe('the session, not the form, says who is acting', () => {
  it('passes the session user to the query rather than anything the form carries', async () => {
    await savePanelProgramAction(7, {}, form({ descriptionMd: 'Hola', institutionId: '999' }));
    expect(savePanelProgram).toHaveBeenCalledWith(sessionUser, 7, expect.anything());
  });

  it('passes null through when nobody is signed in, so the query refuses it', async () => {
    sessionUser = null;
    savePanelProgram.mockRejectedValue(new AuthError('Iniciá sesión.', 'unauthenticated'));
    const state = await savePanelProgramAction(7, {}, form({ descriptionMd: 'Hola' }));
    expect(savePanelProgram).toHaveBeenCalledWith(null, 7, expect.anything());
    expect(state.error).toBe('Iniciá sesión.');
  });

  it('reports an AuthError as its own sentence rather than a generic failure', async () => {
    savePanelProgram.mockRejectedValue(new AuthError('Eso no es de tu institución.', 'forbidden'));
    const state = await savePanelProgramAction(7, {}, form({ descriptionMd: 'x' }));
    expect(state.error).toBe('Eso no es de tu institución.');
  });
});

describe('ownership is checked before the payload is read', () => {
  it('refuses another institution’s offering without answering anything about its shape', async () => {
    assertOwnsOffering.mockRejectedValue(new AuthError('No es tuyo.', 'forbidden'));

    // A payload that would otherwise draw the "decinos cuántas cuotas" message:
    // a monthly fee with no installment count. The ownership refusal must win,
    // or the response tells a stranger their payload was nearly right.
    const state = await savePanelPriceAction(99, {}, form({ monthlyFee: '1.200.000' }));

    expect(state.error).toBe('No es tuyo.');
    expect(savePanelPrice).not.toHaveBeenCalled();
  });
});

describe('malformed input is refused before the query', () => {
  it('refuses a monthly fee with no installments per year', async () => {
    const state = await savePanelPriceAction(5, {}, form({ monthlyFee: '1.200.000' }));
    expect(state.error).toContain('cuántas cuotas');
    expect(savePanelPrice).not.toHaveBeenCalled();
  });

  it('refuses an amount that is not a whole number of guaraníes', async () => {
    const state = await savePanelPriceAction(5, {}, form({ matricula: '1.200.000,50' }));
    expect(state.error).toContain('número entero');
    expect(savePanelPrice).not.toHaveBeenCalled();
  });

  it('refuses a negative amount', async () => {
    const state = await savePanelPriceAction(5, {}, form({ matricula: '-500000' }));
    expect(state.error).toBeTruthy();
    expect(savePanelPrice).not.toHaveBeenCalled();
  });
});

describe('what reaches the query', () => {
  it('parses guaraní amounts out of the format the form shows them in', async () => {
    await savePanelPriceAction(
      5,
      {},
      form({ matricula: '1.450.000', monthlyFee: '850.000', installmentsPerYear: '10' }),
    );
    expect(savePanelPrice).toHaveBeenCalledWith(
      sessionUser,
      5,
      expect.objectContaining({
        matricula: 1_450_000,
        monthlyFee: 850_000,
        installmentsPerYear: 10,
      }),
    );
  });

  it('sends null for a field left blank, never an empty string', async () => {
    await savePanelPriceAction(5, {}, form({ matricula: '', notesMd: '   ', sourceUrl: '' }));
    expect(savePanelPrice).toHaveBeenCalledWith(
      sessionUser,
      5,
      expect.objectContaining({ matricula: null, notesMd: null, sourceUrl: null }),
    );
  });

  it('defaults an unrecognised currency to guaraníes rather than storing it', async () => {
    await savePanelPriceAction(5, {}, form({ currency: 'BTC' }));
    expect(savePanelPrice).toHaveBeenCalledWith(
      sessionUser,
      5,
      expect.objectContaining({ currency: 'PYG' }),
    );
  });

  it('treats the free checkbox as present-or-absent, the way a checkbox posts', async () => {
    await savePanelPriceAction(5, {}, form({ isFree: 'on' }));
    expect(savePanelPrice.mock.calls[0]![2]).toMatchObject({ isFree: true });

    savePanelPrice.mockClear();
    await savePanelPriceAction(5, {}, form({}));
    expect(savePanelPrice.mock.calls[0]![2]).toMatchObject({ isFree: false });
  });

  it('hands the lead status through verbatim, for the query to accept or refuse', async () => {
    // The action does not decide which statuses are settable — `setPanelLeadStatus`
    // does, so the panel and any other caller cannot disagree about the list.
    await setPanelLeadStatusAction(42, {}, form({ status: 'contacted' }));
    expect(setPanelLeadStatus).toHaveBeenCalledWith(sessionUser, 42, 'contacted');

    setPanelLeadStatus.mockRejectedValue(
      new AuthError('Ese estado no se puede asignar.', 'forbidden'),
    );
    const state = await setPanelLeadStatusAction(42, {}, form({ status: 'sent' }));
    expect(state.error).toBe('Ese estado no se puede asignar.');
  });

  it('carries the dispute’s accreditation id and reason, not the programme id', async () => {
    await fileAccreditationDisputeAction(11, 22, {}, form({ reason: 'Ya no está vigente.' }));
    expect(fileAccreditationDispute).toHaveBeenCalledWith(sessionUser, 11, 'Ya no está vigente.');
  });
});
