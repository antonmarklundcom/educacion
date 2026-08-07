/**
 * The write half of the consent signal — everything the banner does that is not
 * React.
 *
 * `consent.ts` owns the cookie's name, its format and the read
 * (`hasAnalyticsConsent`). It is deliberately untouched by this PR: PR-17 reads
 * it and nothing about reading changes. What was missing was the other
 * direction — what value a decision writes, for how long, and how to tell "has
 * not decided yet" from "decided no". That is here, pure, so it can be tested
 * without a DOM and so `ConsentBanner` stays a component rather than a
 * component with a protocol inside it.
 *
 * **Six months, for a refusal too.** A refusal that expired with the session
 * would re-ask on the next visit, which is the pattern that trains people to
 * click accept to make banners go away. A refusal that never expired would mean
 * a decision taken once in 2026 binding a browser forever. Both directions get
 * the same window, and `/legal/privacidad` says so.
 */

import { CONSENT_NONE, parseConsent, readCookie, CONSENT_COOKIE } from './consent';

/** 180 days, applied to an acceptance and to a refusal alike. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/**
 * `'analytics'` or `'none'` — never an empty string. An absent cookie already
 * means "has not decided", so a decision must always be a value
 * (`consent.ts`: "an explicit refusal is a value, not an absent cookie").
 */
export function consentCookieValue(accepted: boolean): string {
  return accepted ? 'analytics' : CONSENT_NONE;
}

/**
 * `SameSite=Lax` because the cookie is only ever read by our own first-party
 * JavaScript, and `Secure` on https so it is never sent in clear. Not
 * `httpOnly`: the reader is `document.cookie` in `Analytics`, by design — this
 * cookie carries a preference, not a credential.
 */
export function serializeConsentCookie(value: string, options: { secure: boolean }): string {
  const parts = [
    `${CONSENT_COOKIE}=${encodeURIComponent(value)}`,
    'path=/',
    `max-age=${CONSENT_MAX_AGE_SECONDS}`,
    'samesite=lax',
  ];
  if (options.secure) parts.push('secure');
  return parts.join('; ');
}

/**
 * Whether to show the banner at all.
 *
 * A recorded decision — in either direction — silences it. Anything else,
 * including a value from a future format this build does not understand, asks
 * again: an unreadable preference is not a preference, and the safe reading of
 * one is to let the person state it in terms this build can honour.
 */
export function shouldPromptForConsent(cookieString: string | null | undefined): boolean {
  const value = readCookie(cookieString, CONSENT_COOKIE);
  if (!value) return true;
  if (value.trim() === CONSENT_NONE) return false;
  return parseConsent(value).size === 0;
}
