'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { AdminFormState } from '@/components/admin/AdminForm';
import { updateArea } from '@/db/queries/admin/areas';
import { parseAreaInput } from '@/lib/admin/validation';
import { currentUser } from '@/lib/auth/session';

export async function updateAreaAction(
  id: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseAreaInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await updateArea(user, id, parsed.data);
  } catch (error) {
    return {
      formError: error instanceof Error ? error.message : 'No se pudo guardar. Intentá de nuevo.',
    };
  }

  revalidatePath('/admin/areas');
  redirect('/admin/areas');
}
