'use server';

/**
 * Approving or rejecting a claim (PR-22).
 *
 * Thin, like every other admin action: `approveClaim` and `rejectClaim` call
 * `requireRole(user, ['admin'])` themselves, because a server action is a POST
 * endpoint reachable without ever rendering the `/admin` layout that guards the
 * page (CLAUDE.md rule 4). The role check being *inside* the query function is
 * what `claims.access.test.ts` calls directly.
 *
 * Approval is `admin` rather than `editor` on purpose — it hands somebody a
 * login, which is a different kind of act from curating data.
 */

import { revalidatePath } from 'next/cache';

import { approveClaim, rejectClaim } from '@/lib/claims';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export interface ClaimDecisionState {
  error?: string;
  message?: string;
}

export async function decideClaimAction(
  claimId: number,
  _state: ClaimDecisionState,
  formData: FormData,
): Promise<ClaimDecisionState> {
  const decision = String(formData.get('decision') ?? '');
  if (decision !== 'approve' && decision !== 'reject') {
    return { error: 'Acción desconocida.' };
  }

  const user = await currentUser();

  try {
    const result =
      decision === 'approve' ? await approveClaim(user, claimId) : await rejectClaim(user, claimId);

    if (!result.ok) return { error: result.error };
    revalidatePath('/admin/reclamos');
    return { message: result.message };
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    console.error('[claims] decision failed', error);
    return { error: 'No se pudo resolver la solicitud.' };
  }
}
