import { describe, expect, it } from 'vitest';

import { CONSENT_TEXT_VERSION, HONEYPOT_FIELD, LEAD_LIMITS } from './contract';
import { validateLead } from './validate';

function payload(overrides: Record<string, unknown> = {}) {
  return {
    offeringId: 42,
    name: 'María González',
    phone: '0981 123 456',
    ageBracket: '18_mas',
    consent: true,
    consentTextVersion: CONSENT_TEXT_VERSION,
    ...overrides,
  };
}

describe('validateLead — consent', () => {
  it('is the one field with no permissive reading', () => {
    for (const consent of [false, undefined, null, 'on', 'true', 1]) {
      const result = validateLead(payload({ consent }));
      expect(result.ok, String(consent)).toBe(false);
      if (!result.ok && !result.honeypot) expect(result.error).toBe('consent_required');
    }
  });

  it('refuses a stale consent version instead of restamping it', () => {
    const result = validateLead(payload({ consentTextVersion: '2020-01-v1' }));
    expect(result.ok).toBe(false);
    if (!result.ok && !result.honeypot) expect(result.error).toBe('consent_version_stale');
  });

  it('cannot produce a valid lead without consent_at and a version', () => {
    const result = validateLead(payload());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead.consentTextVersion).toBe(CONSENT_TEXT_VERSION);
    expect(result.lead.consentAt).toBeInstanceOf(Date);
  });
});

describe('validateLead — the honeypot', () => {
  it('is reported separately so the caller can answer with a success', () => {
    const result = validateLead(payload({ [HONEYPOT_FIELD]: 'Acme SA' }));
    expect(result).toEqual({ ok: false, honeypot: true });
  });

  it('is checked before anything else, so a bot learns nothing from the error', () => {
    // Missing consent AND missing name AND a filled trap: still just the trap.
    const result = validateLead({ [HONEYPOT_FIELD]: 'x' });
    expect(result).toEqual({ ok: false, honeypot: true });
  });

  it('an empty trap is the normal case', () => {
    expect(validateLead(payload({ [HONEYPOT_FIELD]: '' })).ok).toBe(true);
  });
});

describe('validateLead — the minimum fields', () => {
  it('normalises the phone to E.164', () => {
    const result = validateLead(payload({ phone: '(0981) 123-456' }));
    expect(result.ok && result.lead.phoneE164).toBe('+595981123456');
  });

  it('rejects a phone it cannot dial', () => {
    const result = validateLead(payload({ phone: '+46701234567' }));
    expect(result.ok).toBe(false);
    if (!result.ok && !result.honeypot) expect(result.error).toBe('invalid_phone');
  });

  it('treats email and mensaje as optional and stores null, never an empty string', () => {
    const result = validateLead(payload({ email: '   ', message: '' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead.email).toBeNull();
    expect(result.lead.message).toBeNull();
  });

  it('rejects an implausible email rather than storing it', () => {
    expect(validateLead(payload({ email: 'no-arroba' })).ok).toBe(false);
  });

  it('rejects an unknown age bracket', () => {
    expect(validateLead(payload({ ageBracket: 'menor_16' })).ok).toBe(false);
  });

  it('rejects an over-long mensaje instead of silently truncating a person', () => {
    const long = 'a'.repeat(LEAD_LIMITS.messageMax + 1);
    expect(validateLead(payload({ message: long })).ok).toBe(false);
  });

  it('never takes an institution from the caller', () => {
    const result = validateLead(payload({ institutionId: 99 }));
    expect(result.ok).toBe(true);
    // `institutionId` is resolved from the offering by `submitLead`; a field
    // named on the wire must not be able to redirect a lead.
    if (result.ok) expect('institutionId' in result.lead).toBe(false);
  });

  it('rejects a non-object payload', () => {
    for (const value of [null, undefined, 'string', 7, []]) {
      expect(validateLead(value).ok).toBe(false);
    }
  });
});
