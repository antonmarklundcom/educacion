'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { AdminFormState } from '@/components/admin/AdminForm';
import {
  createAdmission,
  deactivateAdmission,
  updateAdmission,
} from '@/db/queries/admin/admissions';
import { parseAdmissionInput } from '@/lib/admin/validation';
import { currentUser } from '@/lib/auth/session';

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo guardar. Intentá de nuevo.';
}

export async function createAdmissionAction(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseAdmissionInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await createAdmission(user, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/admisiones');
  redirect('/admin/admisiones');
}

export async function updateAdmissionAction(
  id: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseAdmissionInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await updateAdmission(user, id, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/admisiones');
  redirect('/admin/admisiones');
}

export async function deactivateAdmissionAction(id: number): Promise<void> {
  const user = await currentUser();
  await deactivateAdmission(user, id);
  revalidatePath('/admin/admisiones');
  redirect('/admin/admisiones');
}
