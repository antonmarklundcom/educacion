/**
 * The consent signal — the contract between PR-15's banner and PR-17's
 * analytics.
 *
 * PR-15 owns the banner and is the only thing that writes the cookie. This
 * module owns its name, its format and the question "may the third-party
 * script load", so that when the banner lands it has an interface to write
 * against rather than a convention to guess at (`agent-workflow.md` §2).
 *
 * ### The line this draws, and why it is where it is
 *
 * Two different things get called "analytics" here and they do not have the
 * same standing.
 *
 * **The third-party script** (Plausible) is a request to another company's
 * server carrying the visitor's IP and the page they are on. That is the thing
 * a banner exists to govern, and it does not load until this module says so.
 *
 * **The first-party `events` table** is not gated, deliberately. It sets no
 * cookie and touches no client storage — the session hash is derived
 * server-side from the request and rotates daily (`architecture.md` §6.4) — so
 * there is no access to the visitor's device to consent to, and the row it
 * writes contains a type, two foreign keys and a non-reversible digest. It is
 * also what an institution's own numbers are computed from, which is a purpose
 * we have to be able to state plainly rather than one that disappears when a
 * banner is dismissed. `/legal/privacidad` (PR-15) names that purpose, its
 * retention and the deletion path.
 *
 * Client-safe: a string in, a boolean out. No storage access, no `document`.
 */

/** Written by PR-15's banner. Read here and nowhere else. */
export const CONSENT_COOKIE = 'ec_consent';

/**
 * PR-15's banner dispatches this on `window` after writing the cookie, so a
 * visitor who accepts starts being counted immediately rather than on their
 * next navigation. Nothing else may dispatch it.
 */
export const CONSENT_CHANGED_EVENT = 'ec:consent-changed';

/**
 * The categories a visitor can grant. Only one exists today; the format is a
 * comma-separated list so PR-15 can add one without a migration of the cookie.
 */
export const CONSENT_CATEGORIES = ['analytics'] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

/** An explicit refusal is a value, not an absent cookie. */
export const CONSENT_NONE = 'none';

export function parseConsent(cookieValue: string | null | undefined): Set<ConsentCategory> {
  const granted = new Set<ConsentCategory>();
  if (!cookieValue) return granted;

  for (const raw of cookieValue.split(',')) {
    const value = raw.trim();
    if ((CONSENT_CATEGORIES as readonly string[]).includes(value)) {
      granted.add(value as ConsentCategory);
    }
  }
  return granted;
}

/**
 * Reads one cookie out of a `document.cookie` string. Written here rather than
 * pulled in as a dependency, and kept pure so it can be tested without a DOM.
 */
export function readCookie(cookieString: string | null | undefined, name: string): string | null {
  if (!cookieString) return null;
  for (const part of cookieString.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * **No cookie means no.** Until PR-15's banner ships nothing writes this cookie,
 * so the third-party script never loads — which is the correct default and the
 * reason the analytics half of this PR is off by default rather than behind a
 * half-built banner (`agent-workflow.md` §6).
 */
export function hasAnalyticsConsent(cookieString: string | null | undefined): boolean {
  return parseConsent(readCookie(cookieString, CONSENT_COOKIE)).has('analytics');
}
