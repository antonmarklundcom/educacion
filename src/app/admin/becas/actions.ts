'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { AdminFormState } from '@/components/admin/AdminForm';
import { archiveBeca, createBeca, isBecaSlugTaken, updateBeca } from '@/db/queries/admin/becas';
import { parseBecaInput } from '@/lib/admin/validation';
import { currentUser } from '@/lib/auth/session';

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo guardar. Intentá de nuevo.';
}

export async function createBecaAction(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseBecaInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (parsed.data.slug && (await isBecaSlugTaken(parsed.data.slug, null))) {
    return { errors: { slug: 'Ese slug ya está en uso.' } };
  }

  try {
    await createBeca(user, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/becas');
  revalidatePath('/becas');
  redirect('/admin/becas');
}

export async function updateBecaAction(
  id: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseBecaInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (parsed.data.slug && (await isBecaSlugTaken(parsed.data.slug, id))) {
    return { errors: { slug: 'Ese slug ya está en uso.' } };
  }

  try {
    await updateBeca(user, id, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/becas');
  revalidatePath('/becas');
  redirect('/admin/becas');
}

export async function archiveBecaAction(id: number): Promise<void> {
  const user = await currentUser();
  await archiveBeca(user, id);
  revalidatePath('/admin/becas');
  revalidatePath('/becas');
  redirect('/admin/becas');
}
