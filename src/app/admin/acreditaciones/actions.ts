'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { AdminFormState } from '@/components/admin/AdminForm';
import {
  createAccreditation,
  retractAccreditation,
  updateAccreditation,
} from '@/db/queries/admin/accreditations';
import { parseAccreditationInput } from '@/lib/admin/validation';
import { currentUser } from '@/lib/auth/session';

/**
 * The citation rule is enforced twice on this path and that is deliberate:
 * `parseAccreditationInput` turns it into a sentence beside the field, and
 * `createAccreditation` / `updateAccreditation` re-assert it in the query
 * module so no future caller can route around the form. `src/db/invariants.ts`
 * is the single definition both of them call.
 */
function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo guardar. Intentá de nuevo.';
}

export async function createAccreditationAction(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseAccreditationInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await createAccreditation(user, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/acreditaciones');
  redirect('/admin/acreditaciones');
}

export async function updateAccreditationAction(
  id: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseAccreditationInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await updateAccreditation(user, id, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/acreditaciones');
  redirect('/admin/acreditaciones');
}

export async function retractAccreditationAction(id: number): Promise<void> {
  const user = await currentUser();
  await retractAccreditation(user, id);
  revalidatePath('/admin/acreditaciones');
  redirect('/admin/acreditaciones');
}
