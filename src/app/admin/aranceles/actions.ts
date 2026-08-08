'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { AdminFormState } from '@/components/admin/AdminForm';
import { createPrice, retirePrice, updatePrice } from '@/db/queries/admin/prices';
import { parsePriceInput } from '@/lib/admin/validation';
import { currentUser } from '@/lib/auth/session';

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo guardar. Intentá de nuevo.';
}

/**
 * Saving a new arancel *supersedes* the current one rather than editing it —
 * see `src/db/queries/admin/prices.ts`. The action is the same shape as PR-19's;
 * the difference is entirely in the query module, which is where it belongs.
 */
export async function createPriceAction(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parsePriceInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await createPrice(user, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/aranceles');
  redirect('/admin/aranceles');
}

export async function updatePriceAction(
  id: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parsePriceInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await updatePrice(user, id, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/aranceles');
  redirect('/admin/aranceles');
}

export async function retirePriceAction(id: number): Promise<void> {
  const user = await currentUser();
  await retirePrice(user, id);
  revalidatePath('/admin/aranceles');
  redirect('/admin/aranceles');
}
