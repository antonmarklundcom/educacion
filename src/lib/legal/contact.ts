/**
 * The contact channel, and the windows we commit to answering it in.
 *
 * One address, on purpose. `risks.md` §R-06 asks for "a working deletion
 * request path" and the operative word is *working*: this site is run by one
 * person, so a channel it can actually honour is one inbox that person already
 * reads. A ticket system nobody is staffed to watch, or a self-service delete
 * button with no `/panel` behind it, would be a promise the product cannot keep
 * — and a privacy policy that promises something it cannot do is worse than one
 * that promises less.
 *
 * The windows are the ones already committed to elsewhere: 72 h for taking
 * content down comes from `data-sources.md` §2, and the 10 working days for a
 * data request is what one person can hold to without a queue.
 */

/** Published in the footer since PR-04. The same inbox handles every request below. */
export const CONTACT_EMAIL = 'contacto@educacion.com.py';

/** Content removal (a logo, a datum an institution disputes) — `data-sources.md` §2. */
export const TAKEDOWN_RESPONSE_HOURS = 72;

/** Deletion of a lead, and any other request about someone's own data. */
export const DATA_REQUEST_RESPONSE_WORKING_DAYS = 10;

/**
 * `mailto:` with the subject pre-filled, so a request arrives already sorted.
 * The subject is a convenience, never a requirement — a mail without it is
 * still a valid request and is handled the same way.
 */
export function contactMailto(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
