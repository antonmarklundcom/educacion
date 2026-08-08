/**
 * Password reset tokens.
 *
 * Four properties, each one a decision rather than a default:
 *
 * 1. **The token is never stored.** The database holds `sha256(token)`, so a
 *    dump is not a set of working reset links. Verification hashes the
 *    presented token and looks *that* up — an equality search on an indexed
 *    hash, which is also why no timing-safe compare is needed here: the secret
 *    is not compared, it is used as a key.
 * 2. **Single-use.** `used_at` is stamped in the same statement that claims
 *    the token, so two concurrent submissions cannot both spend it.
 * 3. **Short-lived.** One hour. A reset link sits in an inbox forever; the
 *    window in which it means anything should not.
 * 4. **Issuing one says nothing.** The request endpoint answers identically
 *    whether or not the address exists — otherwise "forgot password" becomes
 *    the account-enumeration oracle that login carefully is not.
 */

import { createHash, randomBytes } from 'node:crypto';

/** One hour. Long enough for a slow inbox, short enough to matter. */
export const RESET_TTL_MS = 60 * 60 * 1000;

/** 32 bytes of CSPRNG output — 256 bits, unguessable and URL-safe. */
export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex. Fast on purpose: the token is high-entropy, not a password. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function resetExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TTL_MS);
}

export interface StoredResetToken {
  userId: number;
  expiresAt: Date;
  usedAt: Date | null;
}

export type ResetTokenProblem = 'unknown' | 'expired' | 'already_used';

/**
 * Whether a looked-up token may be spent. Pure, so the rules are testable
 * without a database and cannot drift between the check and the write.
 */
export function resetTokenProblem(
  row: StoredResetToken | null | undefined,
  now: Date = new Date(),
): ResetTokenProblem | null {
  if (!row) return 'unknown';
  if (row.usedAt) return 'already_used';
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return null;
}

/**
 * The message shown for every unusable link, whatever the reason.
 *
 * "Este enlace ya fue usado" tells someone holding a stolen link that they had
 * the right one and were merely too late, which is a different piece of
 * information from "that link was never valid".
 */
export const RESET_LINK_INVALID =
  'Este enlace no es válido o ya venció. Pedí uno nuevo para continuar.';

/** What the requester is told, always — whether or not the address exists. */
export const RESET_REQUESTED =
  'Si ese correo tiene una cuenta, te enviamos un enlace para restablecer la contraseña. ' +
  'Revisá tu bandeja de entrada y el spam.';

export function resetEmailBody(link: string): string {
  return [
    'Recibimos un pedido para restablecer la contraseña de tu cuenta en educacion.com.py.',
    '',
    'Entrá en este enlace para elegir una nueva:',
    link,
    '',
    'El enlace vence en 1 hora y se puede usar una sola vez.',
    '',
    'Si no pediste esto, podés ignorar este mensaje: tu contraseña sigue igual.',
  ].join('\n');
}
