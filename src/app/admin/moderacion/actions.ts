'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { resolveConflict, supersedeStaleConflicts } from '@/db/queries/admin/conflicts';
import { currentUser } from '@/lib/auth/session';

export interface ResolveState {
  error?: string;
}

/**
 * Approve (optionally merged), or reject, one queued conflict.
 *
 * The `campo` checkboxes are the merge: each one names a field the source
 * disagrees with us about, and only the ticked ones are written. With none of
 * them rendered — a `new` proposal, which has no current row to merge against —
 * the whole proposal applies or nothing does.
 *
 * Nothing here decides anything: `resolveConflict` writes through the
 * importer's own `insertEntity` / `updateEntity`, so an approved conflict
 * cannot take a path the importer would have refused. If an invariant throws —
 * an uncited `vigente`, say — the conflict stays open and the moderator is told
 * why, which is the correct outcome. A rule a human can click past is not a
 * rule (`risks.md` §R-09).
 */
export async function resolveConflictAction(
  id: number,
  _prevState: ResolveState,
  formData: FormData,
): Promise<ResolveState> {
  const user = await currentUser();

  const action = String(formData.get('decision') ?? '');
  if (action !== 'approve' && action !== 'reject') {
    return { error: 'Acción desconocida.' };
  }

  const note = String(formData.get('note') ?? '').trim() || null;
  const fields = formData.getAll('campo').map(String);
  const hadFieldChoices = formData.get('__hasFieldChoices') === '1';

  try {
    const result = await resolveConflict(user, id, {
      action,
      // Only pass an allow-list when the form actually offered one. An absent
      // list means "the whole proposal"; an empty one from a form that offered
      // choices means the moderator ticked nothing, which `resolveConflict`
      // refuses rather than silently applying everything.
      fields: hadFieldChoices ? fields : undefined,
      note,
    });

    if (result.status === 'applied' && result.entityId != null) {
      // Two runs against a register that moved twice leave two open rows for
      // one entity; resolving the newer one makes the older a decision about a
      // state that no longer exists.
      await supersedeStaleConflicts(user, formData.get('entityType') as never, result.entityId, id);
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo resolver.' };
  }

  revalidatePath('/admin/moderacion');
  redirect('/admin/moderacion');
}
