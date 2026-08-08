'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { AdminFormState } from '@/components/admin/AdminForm';
import {
  archiveProgram,
  createProgram,
  isProgramSlugTaken,
  updateProgram,
} from '@/db/queries/admin/programs';
import { currentUser } from '@/lib/auth/session';
import { parseProgramInput } from '@/lib/admin/validation';

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo guardar. Intentá de nuevo.';
}

export async function createProgramAction(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseProgramInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (
    parsed.data.slug &&
    (await isProgramSlugTaken(parsed.data.institutionId, parsed.data.slug, null))
  ) {
    return { errors: { slug: 'Ese slug ya está en uso para esta institución.' } };
  }

  try {
    await createProgram(user, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/programas');
  redirect('/admin/programas');
}

export async function updateProgramAction(
  id: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseProgramInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (
    parsed.data.slug &&
    (await isProgramSlugTaken(parsed.data.institutionId, parsed.data.slug, id))
  ) {
    return { errors: { slug: 'Ese slug ya está en uso para esta institución.' } };
  }

  try {
    await updateProgram(user, id, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/programas');
  redirect('/admin/programas');
}

export async function archiveProgramAction(id: number): Promise<void> {
  const user = await currentUser();
  await archiveProgram(user, id);
  revalidatePath('/admin/programas');
  redirect('/admin/programas');
}
