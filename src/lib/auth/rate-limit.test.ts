import { beforeEach, describe, expect, it } from 'vitest';

import { __resetRateLimitForTests } from '@/lib/leads/rate-limit';
import { __resetSaltForTests } from '@/lib/privacy/hash';

import { LOGIN_ERROR } from './login';
import {
  LOGIN_EMAIL_RULES,
  LOGIN_IP_RULES,
  LOGIN_RATE_LIMITED,
  checkLoginRate,
} from './rate-limit';

const NOW = 1_800_000_000_000;
const IP_PER_MINUTE = LOGIN_IP_RULES[0].limit;
const EMAIL_PER_MINUTE = LOGIN_EMAIL_RULES[0].limit;

beforeEach(() => {
  __resetRateLimitForTests();
  __resetSaltForTests();
});

/** Distinct hashed IPs, so a test can isolate the email tier. */
const ip = (n: number) => `ip-hash-${n}`;

describe('checkLoginRate — the IP tier', () => {
  it('allows a run of attempts and then blocks', () => {
    for (let attempt = 1; attempt <= IP_PER_MINUTE; attempt += 1) {
      expect(
        checkLoginRate(ip(1), `persona-${attempt}@ejemplo.test`, NOW).allowed,
        `#${attempt}`,
      ).toBe(true);
    }

    expect(checkLoginRate(ip(1), 'persona-extra@ejemplo.test', NOW).allowed).toBe(false);
  });

  it('is per IP — one blocked machine does not block another', () => {
    for (let attempt = 0; attempt <= IP_PER_MINUTE; attempt += 1) {
      checkLoginRate(ip(1), `persona-${attempt}@ejemplo.test`, NOW);
    }

    expect(checkLoginRate(ip(1), 'otra@ejemplo.test', NOW).allowed).toBe(false);
    expect(checkLoginRate(ip(2), 'otra@ejemplo.test', NOW).allowed).toBe(true);
  });

  it('lets the window slide', () => {
    for (let attempt = 0; attempt <= IP_PER_MINUTE; attempt += 1) {
      checkLoginRate(ip(1), 'persona@ejemplo.test', NOW);
    }
    expect(checkLoginRate(ip(1), 'persona@ejemplo.test', NOW).allowed).toBe(false);

    const later = NOW + LOGIN_IP_RULES[0].windowMs + 1;
    expect(checkLoginRate(ip(1), 'persona@ejemplo.test', later).allowed).toBe(true);
  });
});

describe('checkLoginRate — the email tier', () => {
  it('blocks one address ground from many machines, which the IP tier cannot see', () => {
    for (let attempt = 1; attempt <= EMAIL_PER_MINUTE; attempt += 1) {
      // A different IP every time: the IP tier never fires.
      expect(checkLoginRate(ip(attempt), 'victima@ejemplo.test', NOW).allowed, `#${attempt}`).toBe(
        true,
      );
    }

    expect(checkLoginRate(ip(99), 'victima@ejemplo.test', NOW).allowed).toBe(false);
  });

  it('treats one address as one bucket however it is capitalised or spaced', () => {
    for (let attempt = 1; attempt <= EMAIL_PER_MINUTE; attempt += 1) {
      checkLoginRate(ip(attempt), 'Victima@Ejemplo.Test', NOW);
    }

    // Changing the case must not buy a fresh quota.
    expect(checkLoginRate(ip(99), '  victima@ejemplo.test  ', NOW).allowed).toBe(false);
  });

  it('leaves other addresses alone', () => {
    for (let attempt = 1; attempt <= EMAIL_PER_MINUTE; attempt += 1) {
      checkLoginRate(ip(attempt), 'victima@ejemplo.test', NOW);
    }

    expect(checkLoginRate(ip(99), 'victima@ejemplo.test', NOW).allowed).toBe(false);
    expect(checkLoginRate(ip(99), 'otra-persona@ejemplo.test', NOW).allowed).toBe(true);
  });
});

describe('checkLoginRate — the properties that make it safe', () => {
  it('does not consume an address quota once the IP is already blocked', () => {
    // Otherwise a blocked attacker could still name any address they liked and
    // lock its real owner out — a rate limiter turned into a denial-of-service
    // tool. Exhaust the IP on unrelated addresses first.
    for (let attempt = 0; attempt <= IP_PER_MINUTE; attempt += 1) {
      checkLoginRate(ip(1), `ruido-${attempt}@ejemplo.test`, NOW);
    }
    expect(checkLoginRate(ip(1), 'victima@ejemplo.test', NOW).allowed).toBe(false);

    // Name the victim from the blocked IP many more times...
    for (let attempt = 0; attempt < EMAIL_PER_MINUTE * 3; attempt += 1) {
      checkLoginRate(ip(1), 'victima@ejemplo.test', NOW);
    }

    // ...and the victim can still sign in from their own machine.
    expect(checkLoginRate(ip(2), 'victima@ejemplo.test', NOW).allowed).toBe(true);
  });

  it('cannot be used to tell an existing address from an unknown one', () => {
    // The key is the submitted string, so the limiter never consults the
    // database and behaves identically either way. Two addresses, treated the
    // same purely by construction.
    const existing = Array.from(
      { length: EMAIL_PER_MINUTE + 1 },
      (_, attempt) => checkLoginRate(ip(attempt), 'existe@ejemplo.test', NOW).allowed,
    );
    const unknown = Array.from(
      { length: EMAIL_PER_MINUTE + 1 },
      (_, attempt) => checkLoginRate(ip(attempt), 'no-existe@ejemplo.test', NOW).allowed,
    );

    expect(existing).toEqual(unknown);
  });

  it('says something different from a failed sign-in, and nothing about the account', () => {
    expect(LOGIN_RATE_LIMITED).not.toBe(LOGIN_ERROR);
    for (const word of ['cuenta', 'correo', 'usuario', 'existe', 'contraseña']) {
      expect(LOGIN_RATE_LIMITED.toLowerCase()).not.toContain(word);
    }
  });

  it('is looser than the reset form, which costs somebody else an email', () => {
    expect(LOGIN_IP_RULES[0].limit).toBeGreaterThan(3);
    expect(LOGIN_EMAIL_RULES[0].limit).toBeLessThan(LOGIN_IP_RULES[0].limit);
  });
});
