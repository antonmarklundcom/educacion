'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { AdminFormState } from '@/components/admin/AdminForm';
import { archiveOffering, createOffering, updateOffering } from '@/db/queries/admin/offerings';
import { currentUser } from '@/lib/auth/session';
import { parseOfferingInput } from '@/lib/admin/validation';

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo guardar. Intentá de nuevo.';
}

export async function createOfferingAction(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseOfferingInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await createOffering(user, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/ofertas');
  redirect('/admin/ofertas');
}

export async function updateOfferingAction(
  id: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseOfferingInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await updateOffering(user, id, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/ofertas');
  redirect('/admin/ofertas');
}

export async function archiveOfferingAction(id: number): Promise<void> {
  const user = await currentUser();
  await archiveOffering(user, id);
  revalidatePath('/admin/ofertas');
  redirect('/admin/ofertas');
}
