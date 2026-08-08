'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { AdminFormState } from '@/components/admin/AdminForm';
import {
  archiveCareer,
  createCareer,
  isCareerSlugTaken,
  updateCareer,
} from '@/db/queries/admin/careers';
import { currentUser } from '@/lib/auth/session';
import { parseCareerInput } from '@/lib/admin/validation';

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo guardar. Intentá de nuevo.';
}

export async function createCareerAction(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseCareerInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (parsed.data.slug && (await isCareerSlugTaken(parsed.data.slug, null))) {
    return { errors: { slug: 'Ese slug ya está en uso.' } };
  }

  try {
    await createCareer(user, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/carreras');
  redirect('/admin/carreras');
}

export async function updateCareerAction(
  id: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseCareerInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (parsed.data.slug && (await isCareerSlugTaken(parsed.data.slug, id))) {
    return { errors: { slug: 'Ese slug ya está en uso.' } };
  }

  try {
    await updateCareer(user, id, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/carreras');
  redirect('/admin/carreras');
}

export async function archiveCareerAction(id: number): Promise<void> {
  const user = await currentUser();
  await archiveCareer(user, id);
  revalidatePath('/admin/carreras');
  redirect('/admin/carreras');
}
