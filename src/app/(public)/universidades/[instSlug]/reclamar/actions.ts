'use server';

/**
 * The public "¿Es tu institución?" submission (PR-22).
 *
 * Unauthenticated by design — a university that has never heard of us has no
 * account to sign in with, so this is the one door into the panel that opens
 * from outside. It therefore grants **nothing**: it writes a request row and,
 * only when the domain check passed, sends a token to that address. Every
 * decision about whether the claim can complete lives in
 * `src/db/queries/claims.ts` and in `src/lib/claims/domain.ts`, which are pure
 * enough to test.
 *
 * The two request-shaped defences a server action still has to apply itself,
 * because a server action is a POST endpoint reachable without ever rendering
 * the form:
 *
 * - **Origin**, which a browser cannot be talked out of sending, so a form
 *   hosted elsewhere cannot post into this one.
 * - **Rate limit** on the hashed IP, reusing the lead pipeline's in-process
 *   tier. `requestClaim` adds the durable half — an institution can only have
 *   so many open claims regardless of where they came from.
 */

import { headers } from 'next/headers';

import { requestClaim, ROUTE_EXPLANATION, type ClaimRequestOutcome } from '@/lib/claims';
import { checkRate } from '@/lib/leads/rate-limit';
import { hashClientIp } from '@/lib/privacy/request';

export interface ClaimRequestState {
  error?: string;
  message?: string;
  /** Set when the claim went to the admin queue, so the page can explain why. */
  queued?: boolean;
}

/** Stricter than the lead form's: nobody legitimately claims five profiles a minute. */
const CLAIM_RATE = [
  { limit: 3, windowMs: 60_000 },
  { limit: 10, windowMs: 3_600_000 },
];

function field(formData: FormData, name: string, max: number): string | null {
  const value = formData.get(name);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}

export async function requestClaimAction(
  institutionSlug: string,
  _state: ClaimRequestState,
  formData: FormData,
): Promise<ClaimRequestState> {
  const requestHeaders = await headers();

  const origin = requestHeaders.get('origin');
  const host = requestHeaders.get('host');
  if (origin && host) {
    try {
      if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
        return { error: 'No pudimos procesar el formulario. Recargá la página.' };
      }
    } catch {
      return { error: 'No pudimos procesar el formulario. Recargá la página.' };
    }
  }

  const { allowed } = checkRate(`claim:${hashClientIp(requestHeaders)}`, Date.now(), CLAIM_RATE);
  if (!allowed) {
    return {
      error: 'Recibimos varias solicitudes desde acá. Esperá unos minutos y probá de nuevo.',
    };
  }

  const email = field(formData, 'email', 255);
  if (!email) return { error: 'Escribí tu correo institucional.' };

  let result: ClaimRequestOutcome;
  try {
    result = await requestClaim({
      institutionSlug,
      email,
      contactName: field(formData, 'contactName', 160),
      note: field(formData, 'note', 500),
    });
  } catch (error) {
    console.error('[claims] request failed', error);
    return { error: 'No pudimos registrar tu solicitud. Probá de nuevo en un rato.' };
  }

  switch (result.outcome) {
    case 'emailed':
      return {
        message:
          `Te enviamos un enlace a ${result.email}. Sirve una sola vez y vence en 72 horas. ` +
          `Revisá también la carpeta de spam.`,
      };
    case 'queued':
      return {
        queued: true,
        message:
          `Recibimos tu solicitud para ${result.institutionName}. ${ROUTE_EXPLANATION[result.reason]} ` +
          `Por eso la vamos a revisar a mano y te escribimos a ${result.email}.`,
      };
    case 'mail_failed':
      return {
        error:
          `Registramos tu solicitud pero no pudimos enviarte el correo a ${result.email}. ` +
          `Escribinos y lo resolvemos.`,
      };
    case 'already_claimed':
      return {
        error:
          `El perfil de ${result.institutionName} ya está a cargo de alguien. ` +
          `Si trabajás ahí y necesitás acceso, escribinos.`,
      };
    case 'too_many':
      return {
        error:
          'Ya hay varias solicitudes abiertas para esta institución. Estamos revisándolas; ' +
          'escribinos si es urgente.',
      };
    case 'invalid_email':
      return { error: 'Esa dirección de correo no parece válida.' };
  }
}
