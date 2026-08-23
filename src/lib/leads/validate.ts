/**
 * Server-side validation of a lead submission.
 *
 * Everything the browser sends is re-checked here. The modal's own checks exist
 * to give a student a useful message before they hit send; they are not a
 * security boundary and this module never assumes they ran (CLAUDE.md rule 4).
 *
 * Pure — no database, no crypto, no `Request`. That is what makes the consent
 * rule testable as a rule rather than as an HTTP behaviour: `validateLead`
 * cannot return a valid result whose `consentAt` is unset, and the table's
 * `leads_consent_required` CHECK is the second lock on the same door.
 *
 * ### The split with `schema.ts` (PR-51)
 *
 * The **shape** — types, trims, lengths, the age enum — is one zod schema that
 * the modal and this module both read, so a limit cannot be enforced in two
 * places with two different numbers. The **rules** are still here, in this
 * order, because each is a decision the schema cannot carry: the honeypot is
 * answered as a success before anything else, the phone is normalised by
 * `parseParaguayanPhone` rather than pattern-matched, and consent is compared
 * against the version the person was actually shown. See `schema.ts`.
 */

import {
  CONSENT_TEXT_VERSION,
  HONEYPOT_FIELD,
  LEAD_LIMITS,
  type AgeBracket,
  type LeadErrorCode,
} from './contract';
import { parseParaguayanPhone } from './phone';
import { honeypotSchema, leadPayloadSchema } from './schema';

/** The validated payload. `institutionId` is resolved by the route, not here. */
export interface ValidatedLead {
  offeringId: number;
  name: string;
  phoneE164: string;
  email: string | null;
  message: string | null;
  ageBracket: AgeBracket;
  consentTextVersion: string;
  consentAt: Date;
  sourcePage: string | null;
}

export type ValidationResult =
  | { ok: true; lead: ValidatedLead }
  /** The honeypot was filled. The caller answers 200 and stores nothing. */
  | { ok: false; honeypot: true }
  | { ok: false; honeypot?: false; error: LeadErrorCode };

export function validateLead(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'invalid_payload' };

  // The honeypot is checked first and answered as a success by the caller: a
  // bot that learns which field betrayed it simply stops filling that field.
  // Parsed on its own so a payload that is malformed *and* trapped is still a
  // trap — otherwise a bot could tell the two apart by sending rubbish.
  const trap = honeypotSchema.safeParse(input);
  if (trap.success && trap.data[HONEYPOT_FIELD]) return { ok: false, honeypot: true };

  const parsed = leadPayloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_payload' };
  const body = parsed.data;

  // Normalised, not pattern-matched: `parseParaguayanPhone` turns what a person
  // typed into E.164, and answers its own error code so the modal can say what
  // is wrong with the number rather than "revisá los datos".
  const parsedPhone = parseParaguayanPhone(body.phone);
  if (!parsedPhone.ok || !parsedPhone.e164) return { ok: false, error: 'invalid_phone' };

  // Consent is the one field with no permissive reading. Unchecked is a
  // refusal, and a lead without it is not stored (risks.md §R-06).
  if (body.consent !== true) return { ok: false, error: 'consent_required' };

  // The version is compared, never taken on trust: recording a lead against a
  // text the person did not see is worse than asking them to reload.
  if (body.consentTextVersion !== CONSENT_TEXT_VERSION) {
    return { ok: false, error: 'consent_version_stale' };
  }

  return {
    ok: true,
    lead: {
      offeringId: body.offeringId,
      name: body.name,
      phoneE164: parsedPhone.e164,
      email: body.email ?? null,
      message: body.message ?? null,
      ageBracket: body.ageBracket,
      consentTextVersion: CONSENT_TEXT_VERSION,
      consentAt: new Date(),
      sourcePage: body.sourcePage ? body.sourcePage.slice(0, LEAD_LIMITS.sourcePageMax) : null,
    },
  };
}
