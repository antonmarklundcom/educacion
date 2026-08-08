'use server';

/**
 * Every write `/panel` can perform (PR-21).
 *
 * ### The rule these all share
 *
 * A server action is a POST endpoint with a generated URL. It does **not**
 * re-run the `/panel` layout guard, and the ids it receives come from a form an
 * institution user controls. So each action starts by reading the session
 * server-side and hands it, plus the id, to a query function that resolves the
 * row's owning institution and compares it to `scopeToInstitution(user)`
 * (`src/db/queries/panel/scope.ts`). Filtering a list by institution is
 * necessary and is not sufficient — the id in the request is an object
 * reference, and every object reference is checked.
 *
 * `src/db/queries/panel/access.test.ts` calls the functions in this file
 * directly, with a session for institution B and ids owned by institution A,
 * and asserts every one of them refuses. That test is the acceptance bar for
 * this PR, not the fact that the UI does not render the link.
 */

import { revalidatePath } from 'next/cache';

import {
  createPanelAdmission,
  savePanelAdmission,
  savePanelOffering,
  savePanelPrice,
  savePanelProgram,
  type PanelSaveResult,
} from '@/db/queries/panel/edits';
import {
  changeMemberRole,
  inviteMember,
  removeMember,
  type MemberRole,
} from '@/db/queries/panel/members';
import { assertOwnsOffering } from '@/db/queries/panel/scope';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export interface PanelFormState {
  error?: string;
  message?: string;
  /** Fields the panel refused because they are not the institution's to change. */
  rejected?: string[];
}

function failure(error: unknown): PanelFormState {
  if (error instanceof AuthError) return { error: error.message };
  return {
    error: error instanceof Error ? error.message : 'No se pudo guardar. Probá de nuevo.',
  };
}

function success(result: PanelSaveResult): PanelFormState {
  return {
    message: result.message,
    rejected: result.rejected.length > 0 ? result.rejected : undefined,
  };
}

function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function money(formData: FormData, name: string): number | null {
  const raw = text(formData, name)?.replace(/[.\s]/g, '');
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`"${name}" tiene que ser un número entero de guaraníes, sin centavos.`);
  }
  return value;
}

function integer(formData: FormData, name: string): number | null {
  const raw = text(formData, name);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`"${name}" tiene que ser un número entero.`);
  return value;
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                  */
/* -------------------------------------------------------------------------- */

export async function savePanelProgramAction(
  programId: number,
  _prevState: PanelFormState,
  formData: FormData,
): Promise<PanelFormState> {
  try {
    const user = await currentUser();
    const result = await savePanelProgram(user, programId, {
      descriptionMd: text(formData, 'descriptionMd'),
      titleAwarded: text(formData, 'titleAwarded'),
      // Review-gated. Submitted here because the form renders them; the split
      // decides where each one goes, not the caller.
      nameOfficial: text(formData, 'nameOfficial'),
      level: text(formData, 'level'),
      conesResolution: text(formData, 'conesResolution'),
    });
    revalidatePath('/panel/carreras');
    return success(result);
  } catch (error) {
    return failure(error);
  }
}

export async function savePanelOfferingAction(
  offeringId: number,
  _prevState: PanelFormState,
  formData: FormData,
): Promise<PanelFormState> {
  try {
    const user = await currentUser();
    const result = await savePanelOffering(user, offeringId, {
      planUrl: text(formData, 'planUrl'),
      credits: integer(formData, 'credits'),
      modality: text(formData, 'modality'),
      shift: text(formData, 'shift'),
      durationMonths: integer(formData, 'durationMonths'),
    });
    revalidatePath('/panel/ofertas');
    return success(result);
  } catch (error) {
    return failure(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Prices                                                                     */
/* -------------------------------------------------------------------------- */

export async function savePanelPriceAction(
  offeringId: number,
  _prevState: PanelFormState,
  formData: FormData,
): Promise<PanelFormState> {
  try {
    const user = await currentUser();

    // Authorization before validation, always. Answering "decinos cuántas
    // cuotas" to a request for somebody else's offering tells the sender that
    // the offering exists and that the shape of their payload was nearly right
    // — a small oracle, and free to close by checking first.
    await assertOwnsOffering(user, offeringId);

    const isFree = formData.get('isFree') != null;
    const monthlyFee = money(formData, 'monthlyFee');
    const installmentsPerYear = integer(formData, 'installmentsPerYear');

    if (!isFree && monthlyFee != null && installmentsPerYear == null) {
      return {
        error:
          'Decinos cuántas cuotas por año. Sin eso no podemos calcular el costo anual y tu carrera no entra en el comparador.',
      };
    }

    const result = await savePanelPrice(user, offeringId, {
      currency: formData.get('currency') === 'USD' ? 'USD' : 'PYG',
      matricula: money(formData, 'matricula'),
      monthlyFee,
      installmentsPerYear,
      admissionFee: money(formData, 'admissionFee'),
      isFree,
      notesMd: text(formData, 'notesMd'),
      sourceUrl: text(formData, 'sourceUrl'),
      validFrom: text(formData, 'validFrom'),
      validTo: text(formData, 'validTo'),
    });

    revalidatePath('/panel/ofertas');
    revalidatePath('/carreras');
    return success(result);
  } catch (error) {
    return failure(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Admissions                                                                 */
/* -------------------------------------------------------------------------- */

export async function savePanelAdmissionAction(
  admissionId: number,
  _prevState: PanelFormState,
  formData: FormData,
): Promise<PanelFormState> {
  try {
    const user = await currentUser();
    const result = await savePanelAdmission(user, admissionId, {
      periodLabel: text(formData, 'periodLabel'),
      registrationOpens: text(formData, 'registrationOpens'),
      registrationCloses: text(formData, 'registrationCloses'),
      examDate: text(formData, 'examDate'),
      classesStart: text(formData, 'classesStart'),
      requirementsMd: text(formData, 'requirementsMd'),
      processMd: text(formData, 'processMd'),
      url: text(formData, 'url'),
      isActive: formData.get('isActive') != null,
    });
    revalidatePath('/panel/convocatorias');
    return success(result);
  } catch (error) {
    return failure(error);
  }
}

export async function createPanelAdmissionAction(
  programId: number,
  _prevState: PanelFormState,
  formData: FormData,
): Promise<PanelFormState> {
  try {
    const user = await currentUser();
    await createPanelAdmission(user, programId, {
      periodLabel: text(formData, 'periodLabel'),
      registrationOpens: text(formData, 'registrationOpens'),
      registrationCloses: text(formData, 'registrationCloses'),
      examDate: text(formData, 'examDate'),
      classesStart: text(formData, 'classesStart'),
      requirementsMd: text(formData, 'requirementsMd'),
      processMd: text(formData, 'processMd'),
      url: text(formData, 'url'),
      isActive: true,
    });
    revalidatePath('/panel/convocatorias');
    return { message: 'Publicamos tu convocatoria.' };
  } catch (error) {
    return failure(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Members — institution_admin only                                           */
/* -------------------------------------------------------------------------- */

export async function inviteMemberAction(
  _prevState: PanelFormState,
  formData: FormData,
): Promise<PanelFormState> {
  try {
    const user = await currentUser();
    const role: MemberRole =
      formData.get('role') === 'institution_admin' ? 'institution_admin' : 'institution_editor';

    const { created } = await inviteMember(user, {
      email: String(formData.get('email') ?? ''),
      name: text(formData, 'name'),
      role,
    });

    revalidatePath('/panel/miembros');
    return {
      message: created
        ? 'Agregamos a esta persona a tu equipo. Todavía no puede ingresar: escribinos para que le habilitemos la contraseña.'
        : 'Vinculamos esa cuenta a tu institución.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function changeMemberRoleAction(
  targetUserId: number,
  _prevState: PanelFormState,
  formData: FormData,
): Promise<PanelFormState> {
  try {
    const user = await currentUser();
    const role: MemberRole =
      formData.get('role') === 'institution_admin' ? 'institution_admin' : 'institution_editor';
    await changeMemberRole(user, targetUserId, role);
    revalidatePath('/panel/miembros');
    return { message: 'Actualizamos el rol.' };
  } catch (error) {
    return failure(error);
  }
}

export async function removeMemberAction(
  targetUserId: number,
  // Kept in the signature so this binds like every other action in this file
  // and can be swapped into a `useActionState` form without a wrapper.
  _prevState: PanelFormState, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<PanelFormState> {
  try {
    const user = await currentUser();
    await removeMember(user, targetUserId);
    revalidatePath('/panel/miembros');
    return { message: 'Quitamos a esa persona del equipo.' };
  } catch (error) {
    return failure(error);
  }
}
