'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { resolveAccreditationDispute } from '@/db/queries/panel/disputes';
import { currentUser } from '@/lib/auth/session';

export interface ResolveDisputeState {
  error?: string;
}

export async function resolveDisputeAction(
  id: number,
  _prevState: ResolveDisputeState,
  formData: FormData,
): Promise<ResolveDisputeState> {
  const user = await currentUser();

  const outcome = String(formData.get('outcome') ?? '');
  if (outcome !== 'corrected' && outcome !== 'rejected') {
    return { error: 'Elegí un resultado.' };
  }
  const notes = String(formData.get('notes') ?? '').trim() || null;

  try {
    await resolveAccreditationDispute(user, id, { outcome, notes });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo resolver.' };
  }

  revalidatePath('/admin/disputas');
  redirect('/admin/disputas');
}
