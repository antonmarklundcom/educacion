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
 */

import {
  CONSENT_TEXT_VERSION,
  HONEYPOT_FIELD,
  LEAD_LIMITS,
  type AgeBracket,
  type LeadErrorCode,
} from './contract';
import { parseParaguayanPhone } from './phone';

const AGE_BRACKETS: readonly AgeBracket[] = ['menor_18', '18_mas', 'no_declarado'];

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

function str(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

/**
 * Deliberately permissive: one `@`, something either side, no spaces. Email is
 * optional here and the only cost of a typo is an undeliverable copy — a regex
 * strict enough to be "correct" rejects real addresses, which costs a lead.
 */
function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= LEAD_LIMITS.emailMax;
}

export function validateLead(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'invalid_payload' };
  const body = input as Record<string, unknown>;

  // The honeypot is checked first and answered as a success by the caller: a
  // bot that learns which field betrayed it simply stops filling that field.
  const trap = str(body[HONEYPOT_FIELD]);
  if (trap) return { ok: false, honeypot: true };

  const offeringId = Number(body.offeringId);
  if (!Number.isInteger(offeringId) || offeringId <= 0) {
    return { ok: false, error: 'invalid_payload' };
  }

  const name = str(body.name);
  if (!name || name.length < LEAD_LIMITS.nameMin || name.length > LEAD_LIMITS.nameMax) {
    return { ok: false, error: 'invalid_payload' };
  }

  const phone = str(body.phone);
  if (!phone) return { ok: false, error: 'invalid_payload' };
  const parsedPhone = parseParaguayanPhone(phone);
  if (!parsedPhone.ok || !parsedPhone.e164) return { ok: false, error: 'invalid_phone' };

  const rawEmail = str(body.email);
  if (rawEmail && !isPlausibleEmail(rawEmail)) return { ok: false, error: 'invalid_payload' };

  const rawMessage = str(body.message);
  if (rawMessage && rawMessage.length > LEAD_LIMITS.messageMax) {
    return { ok: false, error: 'invalid_payload' };
  }

  const ageBracket = str(body.ageBracket) as AgeBracket | null;
  if (!ageBracket || !AGE_BRACKETS.includes(ageBracket)) {
    return { ok: false, error: 'invalid_payload' };
  }

  // Consent is the one field with no permissive reading. Unchecked is a
  // refusal, and a lead without it is not stored (risks.md §R-06).
  if (body.consent !== true) return { ok: false, error: 'consent_required' };

  // The version is compared, never taken on trust: recording a lead against a
  // text the person did not see is worse than asking them to reload.
  if (str(body.consentTextVersion) !== CONSENT_TEXT_VERSION) {
    return { ok: false, error: 'consent_version_stale' };
  }

  const rawSourcePage = str(body.sourcePage);

  return {
    ok: true,
    lead: {
      offeringId,
      name,
      phoneE164: parsedPhone.e164,
      email: rawEmail || null,
      message: rawMessage || null,
      ageBracket,
      consentTextVersion: CONSENT_TEXT_VERSION,
      consentAt: new Date(),
      sourcePage: rawSourcePage ? rawSourcePage.slice(0, LEAD_LIMITS.sourcePageMax) : null,
    },
  };
}
