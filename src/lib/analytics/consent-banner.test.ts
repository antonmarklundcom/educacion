import { describe, expect, it } from 'vitest';

import { CONSENT_COOKIE, CONSENT_NONE, hasAnalyticsConsent } from './consent';
import {
  CONSENT_MAX_AGE_SECONDS,
  consentCookieValue,
  serializeConsentCookie,
  shouldPromptForConsent,
} from './consent-banner';

describe('consentCookieValue', () => {
  it('writes a value the reader in consent.ts accepts', () => {
    const accepted = consentCookieValue(true);
    expect(hasAnalyticsConsent(`${CONSENT_COOKIE}=${accepted}`)).toBe(true);
  });

  it('writes a refusal as a value, not as an absence', () => {
    expect(consentCookieValue(false)).toBe(CONSENT_NONE);
    expect(hasAnalyticsConsent(`${CONSENT_COOKIE}=${CONSENT_NONE}`)).toBe(false);
  });
});

describe('serializeConsentCookie', () => {
  it('scopes the cookie to the whole site and gives it the stated lifetime', () => {
    const cookie = serializeConsentCookie('analytics', { secure: true });
    expect(cookie).toContain(`${CONSENT_COOKIE}=analytics`);
    expect(cookie).toContain('path=/');
    expect(cookie).toContain(`max-age=${CONSENT_MAX_AGE_SECONDS}`);
    expect(cookie).toContain('samesite=lax');
    expect(cookie).toContain('secure');
  });

  it('omits secure off https, so local dev can still record a decision', () => {
    expect(serializeConsentCookie('analytics', { secure: false })).not.toContain('secure');
  });

  it('gives a refusal the same lifetime as an acceptance', () => {
    const refusal = serializeConsentCookie(CONSENT_NONE, { secure: true });
    expect(refusal).toContain(`max-age=${CONSENT_MAX_AGE_SECONDS}`);
  });
});

describe('shouldPromptForConsent', () => {
  it('prompts when nothing has been decided', () => {
    expect(shouldPromptForConsent(null)).toBe(true);
    expect(shouldPromptForConsent('')).toBe(true);
    expect(shouldPromptForConsent('otra=1')).toBe(true);
  });

  it('stays silent after an acceptance', () => {
    expect(shouldPromptForConsent(`${CONSENT_COOKIE}=analytics`)).toBe(false);
  });

  it('stays silent after a refusal — refusing must not re-prompt on every page', () => {
    expect(shouldPromptForConsent(`${CONSENT_COOKIE}=${CONSENT_NONE}`)).toBe(false);
    expect(shouldPromptForConsent(`a=1; ${CONSENT_COOKIE}=${CONSENT_NONE}; b=2`)).toBe(false);
  });

  it('asks again when the stored value means nothing to this build', () => {
    expect(shouldPromptForConsent(`${CONSENT_COOKIE}=marketing`)).toBe(true);
  });
});
