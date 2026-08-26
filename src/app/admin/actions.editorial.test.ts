/**
 * The two admin actions the PR-51 scan could see but not exercise (PR-54).
 *
 * `actions.test.ts` covers the twenty-file shape and two representatives —
 * `updateAreaAction` and the arancel path. These two are the ones that are not
 * three lines: `createInstitutionAction` reads a slug back out of the database,
 * uploads a file and encodes a failure into a redirect, and the beca actions
 * carry CLAUDE.md rule 1 all the way from the form to `/becas`. Both were at 0 %
 * with the scan passing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createInstitution = vi.fn();
const updateInstitution = vi.fn();
const archiveInstitution = vi.fn();
const getInstitutionForEdit = vi.fn();
const isInstitutionSlugTaken = vi.fn();
const setInstitutionLogo = vi.fn();
const uploadInstitutionLogo = vi.fn();

const createBeca = vi.fn();
const updateBeca = vi.fn();
const archiveBeca = vi.fn();
const isBecaSlugTaken = vi.fn();

const revalidatePath = vi.fn();

let sessionUser: unknown = { id: 2, role: 'editor', institutionId: null };

vi.mock('@/lib/auth/session', () => ({ currentUser: async () => sessionUser }));
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock('@/db/queries/admin/institutions', () => ({
  createInstitution: (...a: unknown[]) => createInstitution(...a),
  updateInstitution: (...a: unknown[]) => updateInstitution(...a),
  archiveInstitution: (...a: unknown[]) => archiveInstitution(...a),
  getInstitutionForEdit: (...a: unknown[]) => getInstitutionForEdit(...a),
  isInstitutionSlugTaken: (...a: unknown[]) => isInstitutionSlugTaken(...a),
  setInstitutionLogo: (...a: unknown[]) => setInstitutionLogo(...a),
}));
vi.mock('@/lib/uploads/storage', () => ({
  uploadInstitutionLogo: (...a: unknown[]) => uploadInstitutionLogo(...a),
}));
vi.mock('@/db/queries/admin/becas', () => ({
  createBeca: (...a: unknown[]) => createBeca(...a),
  updateBeca: (...a: unknown[]) => updateBeca(...a),
  archiveBeca: (...a: unknown[]) => archiveBeca(...a),
  isBecaSlugTaken: (...a: unknown[]) => isBecaSlugTaken(...a),
}));

const { createInstitutionAction, updateInstitutionAction, archiveInstitutionAction } =
  await import('./instituciones/actions');
const { createBecaAction, archiveBecaAction } = await import('./becas/actions');

function form(entries: Record<string, string>, logo?: File): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  if (logo) data.set('logo', logo);
  return data;
}

const institution = {
  nameOfficial: 'Universidad de ejemplo',
  nameShort: 'UE',
  management: 'privada',
  type: 'universidad',
  status: 'draft',
};

const beca = {
  title: 'Beca de excelencia',
  summary: 'Cubre la matrícula del primer año.',
  type: 'institucional',
  coverage: 'total',
  sourceUrl: 'https://example.edu.py/becas',
  providerName: 'Universidad de ejemplo',
  status: 'draft',
};

beforeEach(() => {
  sessionUser = { id: 2, role: 'editor', institutionId: null };
  for (const mock of [
    createInstitution,
    updateInstitution,
    archiveInstitution,
    getInstitutionForEdit,
    isInstitutionSlugTaken,
    setInstitutionLogo,
    uploadInstitutionLogo,
    createBeca,
    updateBeca,
    archiveBeca,
    isBecaSlugTaken,
    revalidatePath,
  ]) {
    mock.mockReset();
  }
  createInstitution.mockResolvedValue(11);
  getInstitutionForEdit.mockResolvedValue({ id: 11, slug: 'universidad-de-ejemplo' });
  isInstitutionSlugTaken.mockResolvedValue(false);
  isBecaSlugTaken.mockResolvedValue(false);
  uploadInstitutionLogo.mockResolvedValue('https://cdn.example/logo.webp');
});

describe('createInstitutionAction', () => {
  it('refuses a malformed submission before any write', async () => {
    const state = await createInstitutionAction({}, form({ ...institution, management: '' }));
    expect(state.errors).toBeTruthy();
    expect(createInstitution).not.toHaveBeenCalled();
    expect(isInstitutionSlugTaken).not.toHaveBeenCalled();
  });

  it('refuses a slug already in use, naming the field', async () => {
    isInstitutionSlugTaken.mockResolvedValue(true);
    const state = await createInstitutionAction({}, form({ ...institution, slug: 'una' }));
    expect(state.errors?.slug).toBeDefined();
    expect(createInstitution).not.toHaveBeenCalled();
    // `null` is "no row to exclude": on create there is no current row.
    expect(isInstitutionSlugTaken).toHaveBeenCalledWith('una', null);
  });

  it('hands the session and the parsed payload through, then redirects', async () => {
    await expect(createInstitutionAction({}, form(institution))).rejects.toThrow(
      'redirect:/admin/instituciones',
    );
    expect(createInstitution).toHaveBeenCalledWith(
      sessionUser,
      expect.objectContaining({ nameShort: 'UE', management: 'privada' }),
    );
  });

  it('passes a null session on rather than deciding authorization itself', async () => {
    sessionUser = null;
    createInstitution.mockRejectedValue(new Error('Iniciá sesión.'));
    const state = await createInstitutionAction({}, form(institution));
    expect(createInstitution).toHaveBeenCalledWith(null, expect.anything());
    expect(state.formError).toBe('Iniciá sesión.');
  });

  it('skips the upload entirely when no file was chosen', async () => {
    await expect(createInstitutionAction({}, form(institution))).rejects.toThrow('redirect:');
    expect(uploadInstitutionLogo).not.toHaveBeenCalled();
    expect(setInstitutionLogo).not.toHaveBeenCalled();
  });

  it('ignores an empty file input, which is what a browser sends for "none"', async () => {
    const empty = new File([], '');
    await expect(createInstitutionAction({}, form(institution, empty))).rejects.toThrow(
      'redirect:/admin/instituciones',
    );
    expect(uploadInstitutionLogo).not.toHaveBeenCalled();
  });

  it('stores a chosen logo under the slug the row actually got', async () => {
    const logo = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });
    await expect(createInstitutionAction({}, form(institution, logo))).rejects.toThrow(
      'redirect:/admin/instituciones',
    );
    expect(uploadInstitutionLogo).toHaveBeenCalledWith(logo, 'universidad-de-ejemplo');
    expect(setInstitutionLogo).toHaveBeenCalledWith(
      sessionUser,
      11,
      'https://cdn.example/logo.webp',
    );
  });

  // The row exists by then; losing it because the bucket was down would be
  // worse than saying so on the edit screen.
  it('keeps the institution and carries the upload failure into the redirect', async () => {
    uploadInstitutionLogo.mockRejectedValue(new Error('El bucket no responde.'));
    const logo = new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' });
    await expect(createInstitutionAction({}, form(institution, logo))).rejects.toThrow(
      /redirect:\/admin\/instituciones\/11\?logoError=/,
    );
    expect(createInstitution).toHaveBeenCalled();
  });
});

describe('updateInstitutionAction', () => {
  it('excludes the row being edited from the slug-uniqueness check', async () => {
    await expect(
      updateInstitutionAction(11, {}, form({ ...institution, slug: 'universidad-de-ejemplo' })),
    ).rejects.toThrow('redirect:/admin/instituciones');
    expect(isInstitutionSlugTaken).toHaveBeenCalledWith('universidad-de-ejemplo', 11);
  });

  it('takes the id as an argument and never from the form', async () => {
    await expect(
      updateInstitutionAction(11, {}, form({ ...institution, id: '999' })),
    ).rejects.toThrow('redirect:');
    expect(updateInstitution).toHaveBeenCalledWith(sessionUser, 11, expect.anything());
  });

  it('reports the query’s refusal instead of swallowing it', async () => {
    updateInstitution.mockRejectedValue(new Error('No tenés permiso para esto.'));
    const state = await updateInstitutionAction(11, {}, form(institution));
    expect(state.formError).toBe('No tenés permiso para esto.');
  });
});

describe('archiveInstitutionAction', () => {
  it('archives by argument, with the session, and refreshes the list', async () => {
    await expect(archiveInstitutionAction(11)).rejects.toThrow('redirect:/admin/instituciones');
    expect(archiveInstitution).toHaveBeenCalledWith(sessionUser, 11);
    expect(revalidatePath).toHaveBeenCalledWith('/admin/instituciones');
  });
});

describe('the beca actions carry rule 1 to the query', () => {
  it('refuses a beca with no citable source before anything is written', async () => {
    const state = await createBecaAction({}, form({ ...beca, sourceUrl: '' }));
    expect(state.errors?.sourceUrl).toBeDefined();
    expect(createBeca).not.toHaveBeenCalled();
  });

  it('refuses a coverage and an amount that contradict each other', async () => {
    const state = await createBecaAction({}, form({ ...beca, amountPyg: '1.000.000' }));
    expect(state.errors?.amountPyg).toBeDefined();
    expect(createBeca).not.toHaveBeenCalled();
  });

  it('writes a valid beca and refreshes the public page as well as the admin list', async () => {
    await expect(createBecaAction({}, form(beca))).rejects.toThrow('redirect:/admin/becas');
    expect(createBeca).toHaveBeenCalledWith(
      sessionUser,
      expect.objectContaining({ sourceUrl: 'https://example.edu.py/becas' }),
    );
    // A beca published to an admin list nobody reads is not published.
    expect(revalidatePath).toHaveBeenCalledWith('/becas');
  });

  it('archiving also refreshes the public page', async () => {
    await expect(archiveBecaAction(5)).rejects.toThrow('redirect:/admin/becas');
    expect(archiveBeca).toHaveBeenCalledWith(sessionUser, 5);
    expect(revalidatePath).toHaveBeenCalledWith('/becas');
  });
});
