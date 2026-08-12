'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { AdminFormState } from '@/components/admin/AdminForm';
import { archivePost, createPost, isPostSlugTaken, updatePost } from '@/db/queries/admin/posts';
import { parsePostInput } from '@/lib/admin/validation';
import { currentUser } from '@/lib/auth/session';

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo guardar. Intentá de nuevo.';
}

export async function createPostAction(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parsePostInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (parsed.data.slug && (await isPostSlugTaken(parsed.data.slug, null))) {
    return { errors: { slug: 'Ese slug ya está en uso.' } };
  }

  try {
    await createPost(user, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/blog');
  revalidatePath('/blog');
  redirect('/admin/blog');
}

export async function updatePostAction(
  id: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parsePostInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  if (parsed.data.slug && (await isPostSlugTaken(parsed.data.slug, id))) {
    return { errors: { slug: 'Ese slug ya está en uso.' } };
  }

  try {
    await updatePost(user, id, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/blog');
  revalidatePath('/blog');
  redirect('/admin/blog');
}

export async function archivePostAction(id: number): Promise<void> {
  const user = await currentUser();
  await archivePost(user, id);
  revalidatePath('/admin/blog');
  revalidatePath('/blog');
  redirect('/admin/blog');
}
