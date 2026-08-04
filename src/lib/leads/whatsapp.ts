/**
 * The WhatsApp deep link — the non-form half of the lead pipeline
 * (`architecture.md` §6).
 *
 * In Paraguay this is the path most students actually take, and it is not a
 * form: the conversation happens between the student and the institution and we
 * never see it. What we can see is the click, which is why it is logged as a
 * `whatsapp_click` event — that is the number that proves volume to an
 * institution (`data-model.md`, `events`).
 *
 * **A link is only built from a number the institution published.** With no
 * `whatsapp_e164` there is no button: no fallback to the landline, no guess
 * from a similar-looking field. A wrong number on a CTA sends a student to a
 * stranger, which is worse than no CTA at all (CLAUDE.md rule 1).
 *
 * Pure: no database, no crypto. The client button imports it directly.
 */

import { whatsappDigits } from './phone';

export interface WhatsAppPrefillInput {
  whatsappE164: string | null | undefined;
  programName: string;
  institutionShort: string;
  /** Absolute URL of the page the student is on, when we have one. */
  pageUrl?: string;
}

/**
 * The message the chat opens with. Names the carrera so the institution's
 * inbox is not a wall of "hola" — and says where it came from, which is the
 * attribution that makes the click worth paying for.
 */
export function whatsappPrefill({
  programName,
  institutionShort,
  pageUrl,
}: Omit<WhatsAppPrefillInput, 'whatsappE164'>): string {
  return [
    `Hola ${institutionShort}, quiero información sobre ${programName}.`,
    pageUrl ? `Vi la carrera en educacion.com.py: ${pageUrl}` : 'Los encontré en educacion.com.py.',
  ].join(' ');
}

/** `https://wa.me/595…?text=…`, or `null` when the institution published no number. */
export function whatsappHref(input: WhatsAppPrefillInput): string | null {
  const digits = whatsappDigits(input.whatsappE164);
  if (!digits) return null;
  const text = whatsappPrefill(input);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
