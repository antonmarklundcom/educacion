'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { AdminFormState } from '@/components/admin/AdminForm';
import {
  archiveJobPosting,
  createJobPosting,
  isJobUrlTaken,
  updateJobPosting,
} from '@/db/queries/admin/jobs';
import { parseJobPostingInput } from '@/lib/admin/validation';
import { currentUser } from '@/lib/auth/session';

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo guardar. Intentá de nuevo.';
}

export async function createJobAction(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseJobPostingInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (await isJobUrlTaken(parsed.data.url, null)) {
    return { errors: { url: 'Ese aviso ya está cargado.' } };
  }

  try {
    await createJobPosting(user, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/empleos');
  redirect('/admin/empleos');
}

export async function updateJobAction(
  id: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseJobPostingInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (await isJobUrlTaken(parsed.data.url, id)) {
    return { errors: { url: 'Otro aviso cargado ya usa ese enlace.' } };
  }

  try {
    await updateJobPosting(user, id, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/empleos');
  redirect('/admin/empleos');
}

export async function archiveJobAction(id: number): Promise<void> {
  const user = await currentUser();
  await archiveJobPosting(user, id);
  revalidatePath('/admin/empleos');
  redirect('/admin/empleos');
}
