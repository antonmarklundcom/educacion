/**
 * What the public auth schemas decide, and what they refuse to decide (PR-51).
 *
 * The interesting assertions here are the negative ones. A schema on a sign-in
 * form is a place where being helpful is a vulnerability: every extra thing it
 * can tell a submitter apart is a thing an attacker can ask it. So `loginSchema`
 * refuses only what could not be a credential, and password *strength* is
 * `passwordProblem`'s answer rather than a `.min()` here — three forms and a
 * script have to give the same one.
 */

import { describe, expect, it } from 'vitest';

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from './password';
import {
  EMAIL_MAX,
  PASSWORD_FIELD_MAX,
  changePasswordSchema,
  claimRequestSchema,
  firstIssue,
  loginSchema,
  newPasswordSchema,
  resetRequestSchema,
} from './schema';

describe('loginSchema', () => {
  it('accepts anything that could be a credential, without judging the address', () => {
    // Not an address by any reading — and still accepted, because rejecting it
    // here would answer "malformed" where every real failure answers the same
    // generic sentence. `authenticate` refuses it, uniformly.
    expect(loginSchema.safeParse({ email: 'ana', password: 'x' }).success).toBe(true);
  });

  it('trims the address, because a phone keyboard adds a space', () => {
    const parsed = loginSchema.parse({ email: '  ana@example.com ', password: 'secreto' });
    expect(parsed.email).toBe('ana@example.com');
  });

  it('never trims the password — its spaces belong to whoever set it', () => {
    const parsed = loginSchema.parse({ email: 'ana@example.com', password: ' con espacios ' });
    expect(parsed.password).toBe(' con espacios ');
  });

  it.each([
    ['no email', { password: 'secreto' }],
    ['no password', { email: 'ana@example.com' }],
    ['a blank email', { email: '   ', password: 'secreto' }],
    ['a non-string email', { email: 42, password: 'secreto' }],
    [
      'an address longer than the column',
      { email: `${'a'.repeat(EMAIL_MAX)}@x.com`, password: 'y' },
    ],
    [
      'a password longer than anything we hash',
      { email: 'a@b.co', password: 'x'.repeat(PASSWORD_FIELD_MAX + 1) },
    ],
  ])('refuses %s', (_case, input) => {
    expect(loginSchema.safeParse(input).success).toBe(false);
  });

  it('bounds the password at exactly what the hasher accepts, not a second number', () => {
    expect(PASSWORD_FIELD_MAX).toBe(MAX_PASSWORD_LENGTH);
  });
});

describe('resetRequestSchema', () => {
  it.each(['ana@example.com', 'rector@una.edu.py', 'a.b+c@sub.domain.com.py'])(
    'accepts %s',
    (email) => {
      expect(resetRequestSchema.safeParse({ email }).success).toBe(true);
    },
  );

  it.each(['ana', 'ana@example', 'ana @example.com', '@example.com', 'ana@'])(
    'refuses %s, which could not reach anybody',
    (email) => {
      expect(resetRequestSchema.safeParse({ email }).success).toBe(false);
    },
  );
});

describe('the password pair', () => {
  const long = 'a'.repeat(MIN_PASSWORD_LENGTH + 2);

  it('refuses two that differ, naming the field the user must fix', () => {
    const result = newPasswordSchema.safeParse({ password: long, confirmation: `${long}!` });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(['confirmation']);
  });

  it('accepts a pair that matches, however weak — strength is not its question', () => {
    expect(newPasswordSchema.safeParse({ password: 'corta', confirmation: 'corta' }).success).toBe(
      true,
    );
    // …and `passwordProblem` is the one that says no.
    expect(passwordProblem('corta')).toContain('al menos');
  });

  it('asks the change form for the current password too', () => {
    expect(changePasswordSchema.safeParse({ password: long, confirm: long }).success).toBe(false);
    expect(
      changePasswordSchema.safeParse({ current: 'vieja', password: long, confirm: long }).success,
    ).toBe(true);
  });
});

describe('claimRequestSchema', () => {
  it('requires an address that could receive the token it triggers', () => {
    expect(claimRequestSchema.safeParse({ email: 'rector' }).success).toBe(false);
  });

  it('turns the optional fields into null rather than empty strings', () => {
    const parsed = claimRequestSchema.parse({
      email: 'rector@una.py',
      contactName: '  ',
      note: '',
    });
    expect(parsed.contactName).toBeNull();
    expect(parsed.note).toBeNull();
  });

  it('refuses a note past the column length instead of silently truncating it', () => {
    // Truncating would store half a sentence and tell nobody. The form says how
    // long the field may be; the schema holds it to that.
    expect(claimRequestSchema.safeParse({ email: 'r@una.py', note: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });
});

describe('firstIssue', () => {
  it('gives the form one Paraguayan sentence to render', () => {
    const result = resetRequestSchema.safeParse({ email: 'ana' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(firstIssue(result.error)).toBe('Escribí un correo válido.');
  });
});
