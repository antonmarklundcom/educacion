'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { AdminFormState } from '@/components/admin/AdminForm';
import {
  archiveInstitution,
  createInstitution,
  getInstitutionForEdit,
  isInstitutionSlugTaken,
  setInstitutionLogo,
  updateInstitution,
} from '@/db/queries/admin/institutions';
import { currentUser } from '@/lib/auth/session';
import { parseInstitutionInput } from '@/lib/admin/validation';
import { uploadInstitutionLogo } from '@/lib/uploads/storage';

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo guardar. Intentá de nuevo.';
}

async function handleLogoUpload(
  actor: Awaited<ReturnType<typeof currentUser>>,
  institutionId: number,
  slug: string,
  formData: FormData,
): Promise<string | null> {
  const logo = formData.get('logo');
  if (!(logo instanceof File) || logo.size === 0) return null;

  try {
    const url = await uploadInstitutionLogo(logo, slug);
    await setInstitutionLogo(actor, institutionId, url);
    return null;
  } catch (error) {
    return messageFor(error);
  }
}

export async function createInstitutionAction(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseInstitutionInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (parsed.data.slug && (await isInstitutionSlugTaken(parsed.data.slug, null))) {
    return { errors: { slug: 'Ese slug ya está en uso.' } };
  }

  let id: number;
  try {
    id = await createInstitution(user, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  const created = await getInstitutionForEdit(user, id);
  const logoError = created ? await handleLogoUpload(user, id, created.slug, formData) : null;

  revalidatePath('/admin/instituciones');
  redirect(
    logoError
      ? `/admin/instituciones/${id}?logoError=${encodeURIComponent(logoError)}`
      : '/admin/instituciones',
  );
}

export async function updateInstitutionAction(
  id: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseInstitutionInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (parsed.data.slug && (await isInstitutionSlugTaken(parsed.data.slug, id))) {
    return { errors: { slug: 'Ese slug ya está en uso.' } };
  }

  try {
    await updateInstitution(user, id, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  const current = await getInstitutionForEdit(user, id);
  const logoError = current ? await handleLogoUpload(user, id, current.slug, formData) : null;

  revalidatePath('/admin/instituciones');
  redirect(
    logoError
      ? `/admin/instituciones/${id}?logoError=${encodeURIComponent(logoError)}`
      : '/admin/instituciones',
  );
}

export async function archiveInstitutionAction(id: number): Promise<void> {
  const user = await currentUser();
  await archiveInstitution(user, id);
  revalidatePath('/admin/instituciones');
  redirect('/admin/instituciones');
}
