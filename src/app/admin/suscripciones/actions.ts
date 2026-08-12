'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { AdminFormState } from '@/components/admin/AdminForm';
import {
  createSubscription,
  setSubscriptionStatus,
  updateSubscription,
} from '@/db/queries/subscriptions';
import { parseSubscriptionInput } from '@/lib/admin/validation';
import { currentUser } from '@/lib/auth/session';

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo guardar. Intentá de nuevo.';
}

export async function createSubscriptionAction(
  institutionId: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  // The institution comes from the route, not from the payload: it is chosen
  // in the previous step and must not be re-openable by editing a hidden field.
  formData.set('institutionId', String(institutionId));

  const parsed = parseSubscriptionInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await createSubscription(user, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/suscripciones');
  redirect('/admin/suscripciones');
}

export async function updateSubscriptionAction(
  id: number,
  institutionId: number,
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  formData.set('institutionId', String(institutionId));

  const parsed = parseSubscriptionInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await updateSubscription(user, id, parsed.data);
  } catch (error) {
    return { formError: messageFor(error) };
  }

  revalidatePath('/admin/suscripciones');
  redirect('/admin/suscripciones');
}

export async function cancelSubscriptionAction(id: number): Promise<void> {
  const user = await currentUser();
  await setSubscriptionStatus(user, id, 'cancelled');
  revalidatePath('/admin/suscripciones');
  redirect('/admin/suscripciones');
}
