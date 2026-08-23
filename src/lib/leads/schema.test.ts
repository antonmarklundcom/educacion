/**
 * The lead payload schema (PR-51).
 *
 * `validate.test.ts` covers the pipeline's *rules* — honeypot, consent,
 * consent version, phone — and does it through `validateLead`, unchanged by
 * this PR. What is new is the shape being a schema, so what is tested here is
 * the shape: the transforms that a hand-rolled parser got right and that a
 * refactor of the schema could silently get wrong.
 */

import { describe, expect, it } from 'vitest';

import { HONEYPOT_FIELD, LEAD_LIMITS } from './contract';
import { leadPayloadSchema } from './schema';

const VALID = {
  offeringId: 12,
  name: 'Ana Estudiante',
  phone: '0981 123 456',
  ageBracket: '18_mas',
  consent: true,
  consentTextVersion: '2026-08-v1',
};

describe('the shape', () => {
  it('accepts the payload the modal sends', () => {
    expect(leadPayloadSchema.safeParse(VALID).success).toBe(true);
  });

  it('reads an offeringId sent as a string, which a form would', () => {
    const parsed = leadPayloadSchema.parse({ ...VALID, offeringId: '12' });
    expect(parsed.offeringId).toBe(12);
  });

  it.each([0, -1, 1.5, 'doce', null, [], {}])('refuses %s as an offeringId', (offeringId) => {
    expect(leadPayloadSchema.safeParse({ ...VALID, offeringId }).success).toBe(false);
  });

  it('trims the name before measuring it, not after', () => {
    // '  a  ' is one character of name. Measuring first would accept it.
    expect(leadPayloadSchema.safeParse({ ...VALID, name: '  a  ' }).success).toBe(false);
    expect(leadPayloadSchema.parse({ ...VALID, name: '  Ana Estudiante  ' }).name).toBe(
      'Ana Estudiante',
    );
  });

  it('holds the name to the limits the modal advertises', () => {
    expect(
      leadPayloadSchema.safeParse({ ...VALID, name: 'a'.repeat(LEAD_LIMITS.nameMin - 1) }).success,
    ).toBe(false);
    expect(
      leadPayloadSchema.safeParse({ ...VALID, name: 'a'.repeat(LEAD_LIMITS.nameMax + 1) }).success,
    ).toBe(false);
    expect(
      leadPayloadSchema.safeParse({ ...VALID, name: 'a'.repeat(LEAD_LIMITS.nameMax) }).success,
    ).toBe(true);
  });

  it('treats a blank optional field as absent rather than as an invalid value', () => {
    const parsed = leadPayloadSchema.parse({ ...VALID, email: '   ', message: '' });
    expect(parsed.email).toBeUndefined();
    expect(parsed.message).toBeUndefined();
  });

  it('is permissive about email on purpose, and still refuses a non-address', () => {
    expect(
      leadPayloadSchema.safeParse({ ...VALID, email: 'a.b+c@sub.dominio.com.py' }).success,
    ).toBe(true);
    expect(leadPayloadSchema.safeParse({ ...VALID, email: 'ana@example' }).success).toBe(false);
    expect(leadPayloadSchema.safeParse({ ...VALID, email: 'ana example@x.com' }).success).toBe(
      false,
    );
  });

  it('refuses a message past its limit rather than truncating a student mid-sentence', () => {
    expect(
      leadPayloadSchema.safeParse({ ...VALID, message: 'x'.repeat(LEAD_LIMITS.messageMax + 1) })
        .success,
    ).toBe(false);
  });

  it.each(['menor_18', '18_mas', 'no_declarado'])('accepts the %s bracket', (ageBracket) => {
    expect(leadPayloadSchema.safeParse({ ...VALID, ageBracket }).success).toBe(true);
  });

  it('refuses an age bracket nobody offered', () => {
    expect(leadPayloadSchema.safeParse({ ...VALID, ageBracket: 'mayor_65' }).success).toBe(false);
  });

  it('keeps consent as unknown, because comparing it is the caller’s decision', () => {
    // The schema must not turn a missing consent into a shape error: the route
    // answers `consent_required` and `consent_version_stale` as distinct codes,
    // and a schema failure would collapse both into `invalid_payload`.
    expect(leadPayloadSchema.safeParse({ ...VALID, consent: undefined }).success).toBe(true);
    expect(leadPayloadSchema.safeParse({ ...VALID, consentTextVersion: 'vieja' }).success).toBe(
      true,
    );
  });

  it('carries the honeypot through so the caller can answer it as a success', () => {
    const parsed = leadPayloadSchema.parse({ ...VALID, [HONEYPOT_FIELD]: 'Acme SA' });
    expect(parsed[HONEYPOT_FIELD]).toBe('Acme SA');
  });
});
