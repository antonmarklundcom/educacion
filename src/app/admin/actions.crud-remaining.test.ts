/**
 * The six admin CRUD action files `architecture.md` §37.5 left at 0 % after
 * PR-54 — carreras, programas, sedes, ofertas, empleos and blog — covered
 * only by `actions.test.ts`'s structural scan.
 *
 * All six are the same three-line shape `actions.test.ts` already scans for,
 * so this follows `actions.editorial.test.ts`'s approach rather than
 * `actions.test.ts`'s: one file, `§34.3`'s three properties per domain, plus
 * the one or two things that are not generic —
 *
 * - **empleos**: `parseJobPostingInput`'s "no publicado mañana" rule
 *   (`architecture.md` §37.1 names it directly) and the URL-uniqueness check.
 * - **blog**: `seo.md` §7's "no orphan post" rule, and that publishing
 *   revalidates `/blog` as well as `/admin/blog` — the same "an admin list
 *   nobody reads publicly is not published" property `actions.editorial.test.ts`
 *   pinned for becas.
 * - **sedes** and **programas**: slug uniqueness is scoped by institution, not
 *   global — `isCampusSlugTaken`/`isProgramSlugTaken` take the institution id.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createCareer = vi.fn();
const updateCareer = vi.fn();
const archiveCareer = vi.fn();
const isCareerSlugTaken = vi.fn();

const createProgram = vi.fn();
const updateProgram = vi.fn();
const archiveProgram = vi.fn();
const isProgramSlugTaken = vi.fn();

const createCampus = vi.fn();
const updateCampus = vi.fn();
const archiveCampus = vi.fn();
const isCampusSlugTaken = vi.fn();

const createOffering = vi.fn();
const updateOffering = vi.fn();
const archiveOffering = vi.fn();

const createJobPosting = vi.fn();
const updateJobPosting = vi.fn();
const archiveJobPosting = vi.fn();
const isJobUrlTaken = vi.fn();

const createPost = vi.fn();
const updatePost = vi.fn();
const archivePost = vi.fn();
const isPostSlugTaken = vi.fn();

const revalidatePath = vi.fn();

let sessionUser: unknown = { id: 2, role: 'editor', institutionId: null };

vi.mock('@/lib/auth/session', () => ({ currentUser: async () => sessionUser }));
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock('@/db/queries/admin/careers', () => ({
  createCareer: (...a: unknown[]) => createCareer(...a),
  updateCareer: (...a: unknown[]) => updateCareer(...a),
  archiveCareer: (...a: unknown[]) => archiveCareer(...a),
  isCareerSlugTaken: (...a: unknown[]) => isCareerSlugTaken(...a),
}));
vi.mock('@/db/queries/admin/programs', () => ({
  createProgram: (...a: unknown[]) => createProgram(...a),
  updateProgram: (...a: unknown[]) => updateProgram(...a),
  archiveProgram: (...a: unknown[]) => archiveProgram(...a),
  isProgramSlugTaken: (...a: unknown[]) => isProgramSlugTaken(...a),
}));
vi.mock('@/db/queries/admin/campuses', () => ({
  createCampus: (...a: unknown[]) => createCampus(...a),
  updateCampus: (...a: unknown[]) => updateCampus(...a),
  archiveCampus: (...a: unknown[]) => archiveCampus(...a),
  isCampusSlugTaken: (...a: unknown[]) => isCampusSlugTaken(...a),
}));
vi.mock('@/db/queries/admin/offerings', () => ({
  createOffering: (...a: unknown[]) => createOffering(...a),
  updateOffering: (...a: unknown[]) => updateOffering(...a),
  archiveOffering: (...a: unknown[]) => archiveOffering(...a),
}));
vi.mock('@/db/queries/admin/jobs', () => ({
  createJobPosting: (...a: unknown[]) => createJobPosting(...a),
  updateJobPosting: (...a: unknown[]) => updateJobPosting(...a),
  archiveJobPosting: (...a: unknown[]) => archiveJobPosting(...a),
  isJobUrlTaken: (...a: unknown[]) => isJobUrlTaken(...a),
}));
vi.mock('@/db/queries/admin/posts', () => ({
  createPost: (...a: unknown[]) => createPost(...a),
  updatePost: (...a: unknown[]) => updatePost(...a),
  archivePost: (...a: unknown[]) => archivePost(...a),
  isPostSlugTaken: (...a: unknown[]) => isPostSlugTaken(...a),
}));

const { createCareerAction, updateCareerAction, archiveCareerAction } =
  await import('./carreras/actions');
const { createProgramAction, updateProgramAction, archiveProgramAction } =
  await import('./programas/actions');
const { createCampusAction, updateCampusAction, archiveCampusAction } =
  await import('./sedes/actions');
const { createOfferingAction, updateOfferingAction, archiveOfferingAction } =
  await import('./ofertas/actions');
const { createJobAction, updateJobAction, archiveJobAction } = await import('./empleos/actions');
const { createPostAction, updatePostAction, archivePostAction } = await import('./blog/actions');

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  sessionUser = { id: 2, role: 'editor', institutionId: null };
  for (const mock of [
    createCareer,
    updateCareer,
    archiveCareer,
    isCareerSlugTaken,
    createProgram,
    updateProgram,
    archiveProgram,
    isProgramSlugTaken,
    createCampus,
    updateCampus,
    archiveCampus,
    isCampusSlugTaken,
    createOffering,
    updateOffering,
    archiveOffering,
    createJobPosting,
    updateJobPosting,
    archiveJobPosting,
    isJobUrlTaken,
    createPost,
    updatePost,
    archivePost,
    isPostSlugTaken,
    revalidatePath,
  ]) {
    mock.mockReset();
  }
  isCareerSlugTaken.mockResolvedValue(false);
  isProgramSlugTaken.mockResolvedValue(false);
  isCampusSlugTaken.mockResolvedValue(false);
  isJobUrlTaken.mockResolvedValue(false);
  isPostSlugTaken.mockResolvedValue(false);
});

/* -------------------------------------------------------------------------- */
/* carreras                                                                   */
/* -------------------------------------------------------------------------- */

const career = { nameEs: 'Ingeniería Civil', levelDefault: 'grado', status: 'draft' };

describe('carreras', () => {
  it('refuses a career with no name before the query runs', async () => {
    const state = await createCareerAction({}, form({ ...career, nameEs: '' }));
    expect(state.errors).toBeTruthy();
    expect(createCareer).not.toHaveBeenCalled();
    expect(isCareerSlugTaken).not.toHaveBeenCalled();
  });

  it('parses the comma-separated synonyms into a trimmed array', async () => {
    await expect(
      createCareerAction({}, form({ ...career, synonyms: ' Ing. Civil ,  Civil  ,' })),
    ).rejects.toThrow('redirect:/admin/carreras');
    expect(createCareer).toHaveBeenCalledWith(
      sessionUser,
      expect.objectContaining({ synonyms: ['Ing. Civil', 'Civil'] }),
    );
  });

  it('takes the id as an argument and checks slug uniqueness against it, not against create', async () => {
    await expect(
      updateCareerAction(5, {}, form({ ...career, slug: 'ingenieria-civil' })),
    ).rejects.toThrow('redirect:/admin/carreras');
    expect(isCareerSlugTaken).toHaveBeenCalledWith('ingenieria-civil', 5);
    expect(updateCareer).toHaveBeenCalledWith(sessionUser, 5, expect.anything());
  });

  it('refuses a slug already in use without writing', async () => {
    isCareerSlugTaken.mockResolvedValue(true);
    const state = await createCareerAction({}, form({ ...career, slug: 'derecho' }));
    expect(state.errors?.slug).toBeDefined();
    expect(createCareer).not.toHaveBeenCalled();
  });

  it('passes a null session through rather than deciding authorization itself', async () => {
    sessionUser = null;
    createCareer.mockRejectedValue(new Error('Iniciá sesión.'));
    const state = await createCareerAction({}, form(career));
    expect(createCareer).toHaveBeenCalledWith(null, expect.anything());
    expect(state.formError).toBe('Iniciá sesión.');
  });

  it('reports the query’s refusal instead of swallowing it', async () => {
    updateCareer.mockRejectedValue(new Error('No tenés permiso para esto.'));
    const state = await updateCareerAction(5, {}, form(career));
    expect(state.formError).toBe('No tenés permiso para esto.');
  });

  it('archives by argument, with the session', async () => {
    await expect(archiveCareerAction(9)).rejects.toThrow('redirect:/admin/carreras');
    expect(archiveCareer).toHaveBeenCalledWith(sessionUser, 9);
  });
});

/* -------------------------------------------------------------------------- */
/* programas                                                                  */
/* -------------------------------------------------------------------------- */

const program = {
  institutionId: '1',
  nameOfficial: 'Ingeniería en Sistemas',
  level: 'grado',
  status: 'draft',
};

describe('programas', () => {
  it('refuses a program with no institution before the query runs', async () => {
    const state = await createProgramAction({}, form({ ...program, institutionId: '' }));
    expect(state.errors).toBeTruthy();
    expect(createProgram).not.toHaveBeenCalled();
  });

  it('scopes slug uniqueness by institution, not globally', async () => {
    await expect(
      createProgramAction({}, form({ ...program, institutionId: '7', slug: 'sistemas' })),
    ).rejects.toThrow('redirect:/admin/programas');
    expect(isProgramSlugTaken).toHaveBeenCalledWith(7, 'sistemas', null);
  });

  it('takes the id as an argument on update, never from the form', async () => {
    await expect(updateProgramAction(11, {}, form({ ...program, id: '999' }))).rejects.toThrow(
      'redirect:',
    );
    expect(updateProgram).toHaveBeenCalledWith(sessionUser, 11, expect.anything());
  });

  it('passes a null session through on create', async () => {
    sessionUser = null;
    createProgram.mockRejectedValue(new Error('Iniciá sesión.'));
    const state = await createProgramAction({}, form(program));
    expect(createProgram).toHaveBeenCalledWith(null, expect.anything());
    expect(state.formError).toBe('Iniciá sesión.');
  });

  it('archives by argument, with the session', async () => {
    await expect(archiveProgramAction(3)).rejects.toThrow('redirect:/admin/programas');
    expect(archiveProgram).toHaveBeenCalledWith(sessionUser, 3);
  });
});

/* -------------------------------------------------------------------------- */
/* sedes                                                                      */
/* -------------------------------------------------------------------------- */

const campus = { institutionId: '1', name: 'Campus Central', cityId: '2', status: 'draft' };

describe('sedes', () => {
  it('refuses a campus with no city before the query runs', async () => {
    const state = await createCampusAction({}, form({ ...campus, cityId: '' }));
    expect(state.errors).toBeTruthy();
    expect(createCampus).not.toHaveBeenCalled();
  });

  it('scopes slug uniqueness by institution, not globally', async () => {
    await expect(
      createCampusAction({}, form({ ...campus, institutionId: '4', slug: 'central' })),
    ).rejects.toThrow('redirect:/admin/sedes');
    expect(isCampusSlugTaken).toHaveBeenCalledWith(4, 'central', null);
  });

  it('parses the "sede principal" checkbox rather than trusting an absent field as false only by accident', async () => {
    const data = form(campus);
    data.set('isMain', 'on');
    await expect(createCampusAction({}, data)).rejects.toThrow('redirect:/admin/sedes');
    expect(createCampus).toHaveBeenCalledWith(
      sessionUser,
      expect.objectContaining({ isMain: true }),
    );
  });

  it('reports the query’s refusal instead of swallowing it', async () => {
    updateCampus.mockRejectedValue(new Error('No tenés permiso para esto.'));
    const state = await updateCampusAction(6, {}, form(campus));
    expect(state.formError).toBe('No tenés permiso para esto.');
  });

  it('archives by argument, with the session', async () => {
    await expect(archiveCampusAction(8)).rejects.toThrow('redirect:/admin/sedes');
    expect(archiveCampus).toHaveBeenCalledWith(sessionUser, 8);
  });
});

/* -------------------------------------------------------------------------- */
/* ofertas                                                                    */
/* -------------------------------------------------------------------------- */

const offering = {
  programId: '1',
  campusId: '2',
  modality: 'presencial',
  shift: 'noche',
  status: 'draft',
};

describe('ofertas', () => {
  it('refuses an offering with no campus before the query runs', async () => {
    const state = await createOfferingAction({}, form({ ...offering, campusId: '' }));
    expect(state.errors).toBeTruthy();
    expect(createOffering).not.toHaveBeenCalled();
  });

  it('takes the id as an argument on update, never from the form', async () => {
    await expect(updateOfferingAction(14, {}, form({ ...offering, id: '999' }))).rejects.toThrow(
      'redirect:',
    );
    expect(updateOffering).toHaveBeenCalledWith(sessionUser, 14, expect.anything());
  });

  it('passes a null session through rather than deciding authorization itself', async () => {
    sessionUser = null;
    createOffering.mockRejectedValue(new Error('Iniciá sesión.'));
    const state = await createOfferingAction({}, form(offering));
    expect(createOffering).toHaveBeenCalledWith(null, expect.anything());
    expect(state.formError).toBe('Iniciá sesión.');
  });

  it('archives by argument, with the session', async () => {
    await expect(archiveOfferingAction(2)).rejects.toThrow('redirect:/admin/ofertas');
    expect(archiveOffering).toHaveBeenCalledWith(sessionUser, 2);
  });
});

/* -------------------------------------------------------------------------- */
/* empleos                                                                    */
/* -------------------------------------------------------------------------- */

const job = {
  careerId: '1',
  title: 'Analista Jr.',
  employerName: 'Empresa SA',
  sourceLabel: 'trabajo.com.py',
  source: 'trabajo_com_py',
  status: 'draft',
  url: 'https://trabajo.com.py/aviso/1',
  postedOn: '2020-01-01',
};

describe('empleos', () => {
  it('refuses a posting dated in the future before the query runs (§37.1)', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const state = await createJobAction({}, form({ ...job, postedOn: tomorrow }));
    expect(state.errors?.postedOn).toBeDefined();
    expect(createJobPosting).not.toHaveBeenCalled();
  });

  it('refuses an expiry before the posting date', async () => {
    const state = await createJobAction(
      {},
      form({ ...job, postedOn: '2020-06-01', expiresOn: '2020-01-01' }),
    );
    expect(state.errors?.expiresOn).toBeDefined();
    expect(createJobPosting).not.toHaveBeenCalled();
  });

  it('refuses a URL already loaded, naming the field', async () => {
    isJobUrlTaken.mockResolvedValue(true);
    const state = await createJobAction({}, form(job));
    expect(state.errors?.url).toBeDefined();
    expect(createJobPosting).not.toHaveBeenCalled();
    expect(isJobUrlTaken).toHaveBeenCalledWith(job.url, null);
  });

  it('excludes the row being edited from the URL-uniqueness check', async () => {
    await expect(updateJobAction(13, {}, form(job))).rejects.toThrow('redirect:/admin/empleos');
    expect(isJobUrlTaken).toHaveBeenCalledWith(job.url, 13);
  });

  it('passes a null session through rather than deciding authorization itself', async () => {
    sessionUser = null;
    createJobPosting.mockRejectedValue(new Error('Iniciá sesión.'));
    const state = await createJobAction({}, form(job));
    expect(createJobPosting).toHaveBeenCalledWith(null, expect.anything());
    expect(state.formError).toBe('Iniciá sesión.');
  });

  it('archives by argument, with the session', async () => {
    await expect(archiveJobAction(21)).rejects.toThrow('redirect:/admin/empleos');
    expect(archiveJobPosting).toHaveBeenCalledWith(sessionUser, 21);
  });
});

/* -------------------------------------------------------------------------- */
/* blog                                                                       */
/* -------------------------------------------------------------------------- */

const draftPost = {
  title: 'Cómo elegir carrera',
  excerpt: 'Una guía corta.',
  bodyMd: 'Un texto sin enlaces todavía.',
  authorName: 'Redacción',
  status: 'draft',
};

const publishablePost = {
  ...draftPost,
  status: 'published',
  bodyMd: 'Mirá el [buscador de carreras](/carreras) para más.',
};

describe('blog', () => {
  it('lets a draft with no money-page link save (seo.md §7 blocks publishing, not saving)', async () => {
    await expect(createPostAction({}, form(draftPost))).rejects.toThrow('redirect:/admin/blog');
    expect(createPost).toHaveBeenCalled();
  });

  it('refuses to publish a post with no money-page link, before the query runs', async () => {
    const state = await createPostAction({}, form({ ...draftPost, status: 'published' }));
    expect(state.errors?.bodyMd).toBeDefined();
    expect(createPost).not.toHaveBeenCalled();
  });

  it('refuses a slug already in use without writing', async () => {
    isPostSlugTaken.mockResolvedValue(true);
    const state = await createPostAction({}, form({ ...publishablePost, slug: 'como-elegir' }));
    expect(state.errors?.slug).toBeDefined();
    expect(createPost).not.toHaveBeenCalled();
  });

  it('excludes the row being edited from the slug-uniqueness check', async () => {
    await expect(
      updatePostAction(4, {}, form({ ...publishablePost, slug: 'como-elegir' })),
    ).rejects.toThrow('redirect:/admin/blog');
    expect(isPostSlugTaken).toHaveBeenCalledWith('como-elegir', 4);
  });

  it('publishing refreshes the public page as well as the admin list — an admin-only post is not published', async () => {
    await expect(createPostAction({}, form(publishablePost))).rejects.toThrow(
      'redirect:/admin/blog',
    );
    expect(revalidatePath).toHaveBeenCalledWith('/admin/blog');
    expect(revalidatePath).toHaveBeenCalledWith('/blog');
  });

  it('archiving also refreshes the public page', async () => {
    await expect(archivePostAction(17)).rejects.toThrow('redirect:/admin/blog');
    expect(archivePost).toHaveBeenCalledWith(sessionUser, 17);
    expect(revalidatePath).toHaveBeenCalledWith('/blog');
  });

  it('passes a null session through rather than deciding authorization itself', async () => {
    sessionUser = null;
    createPost.mockRejectedValue(new Error('Iniciá sesión.'));
    const state = await createPostAction({}, form(publishablePost));
    expect(createPost).toHaveBeenCalledWith(null, expect.anything());
    expect(state.formError).toBe('Iniciá sesión.');
  });
});
