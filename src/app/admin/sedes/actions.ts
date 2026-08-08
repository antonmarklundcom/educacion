'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { AdminFormState } from '@/components/admin/AdminForm';
import {
  archiveCampus,
  createCampus,
  isCampusSlugTaken,
  updateCampus,
} from '@/db/queries/admin/campuses';
import { currentUser } from '@/lib/auth/session';
import { parseCampusInput } from '@/lib/admin/validation';

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo guardar. Intentá de nuevo.';
}

export async function createCampusAction(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseCampusInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (
    parsed.data.slug &&
    (await isCampusSlugTaken(parsed.data.institutionId, parsed.data.slug, null))
  ) {
    return { errors: { slug: 'Ese slug ya está en uso para esta institución.' } };
  }

  try {
    await createCampus(user, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/sedes');
  redirect('/admin/sedes');
}

export async function updateCampusAction(
  id: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseCampusInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (
    parsed.data.slug &&
    (await isCampusSlugTaken(parsed.data.institutionId, parsed.data.slug, id))
  ) {
    return { errors: { slug: 'Ese slug ya está en uso para esta institución.' } };
  }

  try {
    await updateCampus(user, id, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/sedes');
  redirect('/admin/sedes');
}

export async function archiveCampusAction(id: number): Promise<void> {
  const user = await currentUser();
  await archiveCampus(user, id);
  revalidatePath('/admin/sedes');
  redirect('/admin/sedes');
}
