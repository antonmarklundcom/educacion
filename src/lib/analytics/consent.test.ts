import { describe, expect, it } from 'vitest';

import { CONSENT_COOKIE, hasAnalyticsConsent, parseConsent, readCookie } from './consent';

describe('readCookie', () => {
  it('finds the cookie among others', () => {
    expect(readCookie(`a=1; ${CONSENT_COOKIE}=analytics; b=2`, CONSENT_COOKIE)).toBe('analytics');
  });

  it('does not match a cookie whose name merely ends with the one asked for', () => {
    expect(readCookie(`not_${CONSENT_COOKIE}=analytics`, CONSENT_COOKIE)).toBeNull();
  });

  it('returns null for an absent cookie or an absent cookie string', () => {
    expect(readCookie('a=1', CONSENT_COOKIE)).toBeNull();
    expect(readCookie('', CONSENT_COOKIE)).toBeNull();
    expect(readCookie(null, CONSENT_COOKIE)).toBeNull();
  });
});

describe('parseConsent', () => {
  it('keeps only known categories', () => {
    expect([...parseConsent('analytics,marketing')]).toEqual(['analytics']);
  });

  it('tolerates spacing', () => {
    expect(parseConsent(' analytics ').has('analytics')).toBe(true);
  });

  it('treats an explicit refusal as granting nothing', () => {
    expect(parseConsent('none').size).toBe(0);
  });
});

describe('hasAnalyticsConsent', () => {
  it('is false with no cookie at all — the default until PR-15 ships the banner', () => {
    expect(hasAnalyticsConsent('')).toBe(false);
    expect(hasAnalyticsConsent(null)).toBe(false);
    expect(hasAnalyticsConsent('otra=1')).toBe(false);
  });

  it('is false on an explicit refusal', () => {
    expect(hasAnalyticsConsent(`${CONSENT_COOKIE}=none`)).toBe(false);
  });

  it('is true only when analytics was granted', () => {
    expect(hasAnalyticsConsent(`${CONSENT_COOKIE}=analytics`)).toBe(true);
  });
});
