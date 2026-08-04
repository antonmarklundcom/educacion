/**
 * The lead pipeline's shared vocabulary — types, limits and the consent text.
 *
 * **Client-safe by construction.** `LeadModal` is a client component and this
 * is the only lead module it may import: nothing here reaches Drizzle, mysql2
 * or `node:crypto`, so importing it cannot pull a database driver into the
 * browser bundle. The same rule the search layer settled in `architecture.md`
 * §5.1 applies here — never import `@/lib/leads` from a `'use client'` file.
 *
 * PR-23 (lead inbox) and PR-28 (institution analytics) build against the types
 * in this file and in `@/lib/leads`; neither should have to change when they
 * land. See `architecture.md` §6.
 */

import type { AGE_BRACKET, LEAD_STATUS } from '@/db/schema';

export type LeadStatus = (typeof LEAD_STATUS)[number];
export type AgeBracket = (typeof AGE_BRACKET)[number];

/* -------------------------------------------------------------------------- */
/* Consent                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The version stamped on every stored lead.
 *
 * **Bump this whenever a single word of the text below changes.** The point of
 * a versioned consent is to be able to answer "what exactly did this person
 * agree to, on this date" two years later, and a text edited in place makes
 * that unanswerable (`risks.md` §R-06).
 *
 * The server never trusts the version the browser sends beyond comparing it to
 * this constant: a mismatch means the page was loaded before a text change and
 * the submission is refused with a message asking the user to reload, rather
 * than recorded against a text they never saw.
 */
export const CONSENT_TEXT_VERSION = '2026-08-v1';

/**
 * Who receives the data, in plain Spanish, naming the institution. This is the
 * text the checkbox labels — unchecked by default, and required.
 */
export function consentText(institutionName: string): string {
  return (
    `Autorizo que mis datos sean enviados a ${institutionName} para que se ` +
    `contacten conmigo sobre esta carrera. educacion.com.py no comparte mis ` +
    `datos con ninguna otra institución.`
  );
}

/**
 * Shown in addition to the consent text when the visitor declares `menor_18`.
 * Ley 6534/2020's standard is instructive rather than binding here, and we
 * build to it anyway (`risks.md` §R-06).
 */
export const MINOR_NOTICE =
  'Si sos menor de 18 años, pedile a tu madre, padre o tutor que sepa que estás ' +
  'enviando estos datos.';

export const AGE_BRACKET_LABELS: Record<AgeBracket, string> = {
  menor_18: 'Menos de 18 años',
  '18_mas': '18 años o más',
  no_declarado: 'Prefiero no decirlo',
};

/* -------------------------------------------------------------------------- */
/* Field limits — the same numbers the server enforces                        */
/* -------------------------------------------------------------------------- */

export const LEAD_LIMITS = {
  nameMin: 2,
  nameMax: 160,
  emailMax: 255,
  messageMax: 1000,
  sourcePageMax: 512,
} as const;

/**
 * The honeypot field name. It looks like something a form-filling bot wants to
 * complete and is hidden from humans; anything non-empty in it is discarded.
 * Deliberately not called `honeypot`.
 */
export const HONEYPOT_FIELD = 'empresa';

/* -------------------------------------------------------------------------- */
/* Wire format                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What the browser POSTs to `/api/leads`.
 *
 * Note what is *not* here: `institutionId`. The server resolves it from
 * `offeringId` through the search contract, so a caller cannot address a lead
 * at an institution the offering does not belong to. Nor is there a birthdate,
 * a document number or an address — `risks.md` §R-06 says collect the minimum
 * and this is the minimum.
 */
export interface LeadRequest {
  offeringId: number;
  name: string;
  phone: string;
  email?: string;
  message?: string;
  ageBracket: AgeBracket;
  consent: boolean;
  consentTextVersion: string;
  sourcePage?: string;
  /** The honeypot, under `HONEYPOT_FIELD`. Always sent, always empty. */
  [HONEYPOT_FIELD]?: string;
}

/** Machine-readable outcomes. The UI maps them to copy; the API never leaks internals. */
export const LEAD_ERROR_CODES = [
  'invalid_origin',
  'invalid_payload',
  'invalid_phone',
  'consent_required',
  'consent_version_stale',
  'unknown_offering',
  'rate_limited',
  'server_error',
] as const;
export type LeadErrorCode = (typeof LEAD_ERROR_CODES)[number];

export type LeadResponse = { ok: true } | { ok: false; error: LeadErrorCode };

/** One message per code, voseo. `server_error` never explains itself further. */
export const LEAD_ERROR_MESSAGES: Record<LeadErrorCode, string> = {
  invalid_origin:
    'No pudimos verificar el origen del formulario. Recargá la página y probá de nuevo.',
  invalid_payload: 'Revisá los datos: falta algo o hay un campo demasiado largo.',
  invalid_phone: 'Ese número no parece un celular paraguayo. Ejemplo: 0981 123 456.',
  consent_required: 'Necesitamos tu autorización para enviar tus datos a la institución.',
  consent_version_stale:
    'Actualizamos el texto de autorización. Recargá la página y volvé a enviarlo.',
  unknown_offering: 'No encontramos esa carrera. Volvé a la página de la carrera y probá de nuevo.',
  rate_limited: 'Ya enviaste varias solicitudes. Esperá un rato antes de mandar otra.',
  server_error: 'No pudimos enviar tu solicitud. Probá de nuevo en unos minutos.',
};
