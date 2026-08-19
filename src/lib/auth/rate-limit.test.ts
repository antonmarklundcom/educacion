import { beforeEach, describe, expect, it } from 'vitest';

import { __resetRateLimitForTests } from '@/lib/leads/rate-limit';
import { __resetSaltForTests } from '@/lib/privacy/hash';

import { LOGIN_ERROR } from './login';
import {
  LOGIN_ACCOUNT_RULES,
  LOGIN_IP_RULES,
  LOGIN_RATE_LIMITED,
  clearLoginRate,
  loginAllowed,
  recordLoginFailure,
} from './rate-limit';

const NOW = 1_800_000_000_000;
const IP_PER_MINUTE = LOGIN_IP_RULES[0].limit;
const IP_PER_HOUR = LOGIN_IP_RULES[1].limit;
const ACCOUNT_PER_HOUR = LOGIN_ACCOUNT_RULES[1].limit;

beforeEach(() => {
  __resetRateLimitForTests();
  __resetSaltForTests();
});

const ip = (n: number) => `ip-hash-${n}`;

/** One failed attempt, as `loginAction` performs it. */
function fail(ipHash: string, email: string, now = NOW): boolean {
  const allowed = loginAllowed(ipHash, email, now);
  if (allowed) recordLoginFailure(ipHash, email, now);
  return allowed;
}

describe('only failures are charged', () => {
  it('never blocks an address that keeps signing in successfully', () => {
    // A school lab or cyber café behind one NAT — the case architecture.md
    // §6.1 says the limits must tolerate. Successes are not recorded at all.
    for (let attempt = 0; attempt < IP_PER_HOUR * 3; attempt += 1) {
      expect(loginAllowed(ip(1), `persona-${attempt}@ejemplo.test`, NOW), `#${attempt}`).toBe(true);
      clearLoginRate(ip(1), `persona-${attempt}@ejemplo.test`);
    }
  });

  it('forgets the account key once the person gets it right', () => {
    for (let attempt = 0; attempt < LOGIN_ACCOUNT_RULES[0].limit; attempt += 1) {
      fail(ip(1), 'persona@ejemplo.test');
    }
    expect(loginAllowed(ip(1), 'persona@ejemplo.test', NOW)).toBe(false);

    clearLoginRate(ip(1), 'persona@ejemplo.test');
    expect(loginAllowed(ip(1), 'persona@ejemplo.test', NOW)).toBe(true);
  });

  it('does not clear the IP key on success', () => {
    // Otherwise an attacker owning one valid account resets their own IP
    // budget at will and grinds the rest of the catalog for free.
    for (let attempt = 0; attempt < IP_PER_MINUTE; attempt += 1) {
      fail(ip(1), `persona-${attempt}@ejemplo.test`);
    }
    clearLoginRate(ip(1), 'persona-0@ejemplo.test');

    expect(loginAllowed(ip(1), 'otra@ejemplo.test', NOW)).toBe(false);
  });
});

describe('the IP tier', () => {
  it('allows a run of failures and then blocks', () => {
    for (let attempt = 1; attempt <= IP_PER_MINUTE; attempt += 1) {
      expect(fail(ip(1), `persona-${attempt}@ejemplo.test`), `#${attempt}`).toBe(true);
    }

    expect(loginAllowed(ip(1), 'persona-extra@ejemplo.test', NOW)).toBe(false);
  });

  it('is per IP — one blocked machine does not block another', () => {
    for (let attempt = 0; attempt <= IP_PER_MINUTE; attempt += 1) {
      fail(ip(1), `persona-${attempt}@ejemplo.test`);
    }

    expect(loginAllowed(ip(1), 'otra@ejemplo.test', NOW)).toBe(false);
    expect(loginAllowed(ip(2), 'otra@ejemplo.test', NOW)).toBe(true);
  });

  it('lets the window slide', () => {
    for (let attempt = 0; attempt <= IP_PER_MINUTE; attempt += 1) {
      fail(ip(1), 'persona@ejemplo.test');
    }
    expect(loginAllowed(ip(1), 'persona@ejemplo.test', NOW)).toBe(false);

    expect(loginAllowed(ip(1), 'persona@ejemplo.test', NOW + LOGIN_IP_RULES[0].windowMs + 1)).toBe(
      true,
    );
  });
});

describe('the account tier is not a remote lockout', () => {
  it('cannot lock a victim out from an attacker-controlled address', () => {
    // The defect this design exists to avoid: with a *global* per-email
    // counter, ~21 paced requests an hour from one ordinary IP — a fifth of
    // the IP budget, no header spoofing — would hold any named account locked
    // out indefinitely, and the victim's own retries would top the window up.
    // Keyed per (address, IP), the attacker can only ever block themselves.
    for (let attempt = 0; attempt < ACCOUNT_PER_HOUR * 3; attempt += 1) {
      fail(ip(666), 'victima@ejemplo.test', NOW + attempt * 60_000);
    }

    // Attacker: blocked, as intended.
    expect(loginAllowed(ip(666), 'victima@ejemplo.test', NOW)).toBe(false);
    // Victim, at their own desk: entirely unaffected.
    expect(loginAllowed(ip(1), 'victima@ejemplo.test', NOW)).toBe(true);
  });

  it('still stops one machine grinding one account', () => {
    for (let attempt = 0; attempt < LOGIN_ACCOUNT_RULES[0].limit; attempt += 1) {
      expect(fail(ip(1), 'victima@ejemplo.test'), `#${attempt}`).toBe(true);
    }

    expect(loginAllowed(ip(1), 'victima@ejemplo.test', NOW)).toBe(false);
    // ...while the same machine may still try a different account, up to the
    // IP tier — the account key is the pair, not the address alone.
    expect(loginAllowed(ip(1), 'otra@ejemplo.test', NOW)).toBe(true);
  });

  it('treats one address as one bucket however it is capitalised or spaced', () => {
    for (let attempt = 0; attempt < LOGIN_ACCOUNT_RULES[0].limit; attempt += 1) {
      fail(ip(1), 'Victima@Ejemplo.Test');
    }

    expect(loginAllowed(ip(1), '  victima@ejemplo.test  ', NOW)).toBe(false);
  });
});

describe('what the limiter says', () => {
  it('cannot be used to tell an existing address from an unknown one', () => {
    // The key is the submitted string and no lookup happens, so the two are
    // identical by construction.
    const seen = (email: string) =>
      Array.from({ length: LOGIN_ACCOUNT_RULES[0].limit + 1 }, () => fail(ip(1), email));

    expect(seen('existe@ejemplo.test')).toEqual(seen('no-existe@ejemplo.test'));
  });

  it('says something different from a failed sign-in, and nothing about the account', () => {
    expect(LOGIN_RATE_LIMITED).not.toBe(LOGIN_ERROR);
    for (const word of ['cuenta', 'correo', 'usuario', 'existe', 'contraseña']) {
      expect(LOGIN_RATE_LIMITED.toLowerCase()).not.toContain(word);
    }
  });
});
