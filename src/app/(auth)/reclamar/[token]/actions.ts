'use server';

/**
 * Completing a claim (PR-22).
 *
 * The token arrives as a path segment bound into the action, not as a form
 * field, so a page that renders this form cannot be tricked into submitting
 * somebody else's token by an injected input.
 *
 * Everything this action decides is "did the form parse". Whether the token is
 * live, whether the institution is still free, whether the address may have an
 * account at all, and the atomic single-use consumption are all `redeemClaim`,
 * where they are one transaction rather than a sequence of checks a race can
 * slip between.
 */

import { redirect } from 'next/navigation';

import { redeemClaim } from '@/lib/claims';

export interface ClaimCompleteState {
  error?: string;
}

export async function completeClaimAction(
  token: string,
  _state: ClaimCompleteState,
  formData: FormData,
): Promise<ClaimCompleteState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('passwordConfirm') ?? '');
  const name =
    String(formData.get('name') ?? '')
      .trim()
      .slice(0, 160) || null;

  if (password !== confirm) {
    return { error: 'Las contraseñas no coinciden.' };
  }

  const result = await redeemClaim(token, { password, name });
  if (!result.ok) return { error: result.message };

  // No session is started here — see `redeemClaim`. The claimant signs in
  // through the ordinary login path, which is the only one with PR-18's uniform
  // failure message and its timing defence.
  redirect(result.mode === 'created' ? '/ingresar?reclamo=listo' : '/ingresar?reclamo=vinculado');
}
