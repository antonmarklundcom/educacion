/**
 * The lead payload's **shape**, as a zod schema (PR-51).
 *
 * ### What moved here, and what deliberately did not
 *
 * `validateLead` used to state the shape and the rules together: fifteen `if`s
 * over `unknown`, each doing its own `typeof`, trim and length check. The shape
 * half is mechanical and is the half a hand-rolled parser gets subtly wrong —
 * an unchecked `Number()` on an array, a length compared before a trim — so it
 * is a schema now, and one schema is what the modal and the route both read.
 *
 * The **rules** stayed in `validateLead`, because each is a decision with a
 * reason attached that a schema cannot carry:
 *
 * - The honeypot is checked **first** and answered as a success, so a bot never
 *   learns which field betrayed it. Inside a schema it would be one refusal
 *   among many, indistinguishable in the response from a real refusal — which
 *   is the opposite of the point.
 * - Consent is compared against `CONSENT_TEXT_VERSION`, not merely required:
 *   recording a lead against a text the person did not see is worse than asking
 *   them to reload, and it has its own error code so the modal can say so.
 * - The phone goes through `parseParaguayanPhone`, which normalises as well as
 *   validates and answers a distinct `invalid_phone`.
 *
 * ### Error codes, not messages
 *
 * The route answers `LeadErrorCode`s from a fixed list and never says which
 * check failed internally (`api/leads/route.ts`). So this schema's job is a
 * boolean: parsed, or not. Nothing here composes a sentence, and no zod message
 * reaches a user.
 *
 * ### Server-side only
 *
 * `LeadModal` deliberately does **not** import this: zod on every public route
 * is weight the 150 kB budget (`architecture.md` §9) does not have spare. The
 * modal keeps its `required` / `minLength` / `maxLength` attributes, driven by
 * the same `LEAD_LIMITS` this schema reads — one statement of every number,
 * enforced twice as it has to be, never written twice.
 * `client-bundle.test.ts` holds the boundary.
 */

import { z } from 'zod';

import { HONEYPOT_FIELD, LEAD_LIMITS } from './contract';

/** A trimmed string, or undefined when it was absent, non-string or blank. */
const trimmed = z
  .unknown()
  .transform((value) => (typeof value === 'string' ? value.trim() : undefined))
  .transform((value) => (value === undefined || value === '' ? undefined : value));

/**
 * Deliberately permissive: one `@`, something either side, no spaces. Email is
 * optional and the only cost of a typo is an undeliverable copy — a regex
 * strict enough to be "correct" rejects real addresses, which costs a lead.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const AGE_BRACKETS = ['menor_18', '18_mas', 'no_declarado'] as const;

/**
 * The shape of what the browser POSTs.
 *
 * `offeringId` accepts the number a JSON body carries **and** the string a
 * form would: the modal sends JSON today, and a schema that only accepted one
 * of the two would be a trap for the first caller that does not.
 */
export const leadPayloadSchema = z.object({
  offeringId: z.coerce.number().int().positive(),
  name: trimmed.pipe(z.string().min(LEAD_LIMITS.nameMin).max(LEAD_LIMITS.nameMax)),
  phone: trimmed.pipe(z.string().min(1)),
  // `.optional()` goes **inside** the pipe, not after it: a blank or
  // whitespace-only field is trimmed to `undefined`, and that undefined has to
  // be acceptable to the target. Outside the pipe it only excuses a key that
  // was absent, so `email: '   '` would be a rejected submission rather than
  // the "no email given" it plainly is.
  email: trimmed.pipe(z.string().regex(EMAIL_PATTERN).max(LEAD_LIMITS.emailMax).optional()),
  message: trimmed.pipe(z.string().max(LEAD_LIMITS.messageMax).optional()),
  ageBracket: z.enum(AGE_BRACKETS),
  sourcePage: trimmed.pipe(z.string().optional()),
  [HONEYPOT_FIELD]: trimmed.optional(),
  consent: z.unknown(),
  consentTextVersion: z.unknown(),
});

export type LeadPayload = z.infer<typeof leadPayloadSchema>;

/** Just the honeypot, parsed before anything else — see the header. */
export const honeypotSchema = z.object({ [HONEYPOT_FIELD]: trimmed.optional() });
