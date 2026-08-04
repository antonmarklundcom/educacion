import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetSaltForTests, hashIp, hashSession } from './hash';

const SALT = 'a-test-salt-long-enough';

beforeEach(() => {
  process.env.PRIVACY_SALT = SALT;
  __resetSaltForTests();
});

afterEach(() => {
  delete process.env.PRIVACY_SALT;
  __resetSaltForTests();
  vi.restoreAllMocks();
});

describe('hashIp', () => {
  it('is stable for the same address', () => {
    expect(hashIp('190.128.1.5')).toBe(hashIp('190.128.1.5'));
  });

  it('does not contain the address it hashed', () => {
    const hash = hashIp('190.128.1.5');
    expect(hash).not.toContain('190');
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('separates different addresses', () => {
    expect(hashIp('190.128.1.5')).not.toBe(hashIp('190.128.1.6'));
  });

  it('is not reproducible without the salt — an unsalted sha256 would be', () => {
    const withSalt = hashIp('190.128.1.5');
    process.env.PRIVACY_SALT = 'a-different-salt-entirely';
    __resetSaltForTests();
    expect(hashIp('190.128.1.5')).not.toBe(withSalt);
  });
});

describe('hashSession', () => {
  it('is stable within a day and different across days', () => {
    const monday = new Date('2026-08-03T22:00:00Z');
    const mondayLater = new Date('2026-08-03T23:59:00Z');
    const tuesday = new Date('2026-08-04T00:01:00Z');

    const ua = 'Mozilla/5.0';
    expect(hashSession('1.2.3.4', ua, monday)).toBe(hashSession('1.2.3.4', ua, mondayLater));
    expect(hashSession('1.2.3.4', ua, monday)).not.toBe(hashSession('1.2.3.4', ua, tuesday));
  });

  it('is not the IP hash of the same address', () => {
    const now = new Date('2026-08-04T10:00:00Z');
    expect(hashSession('1.2.3.4', 'ua', now)).not.toBe(hashIp('1.2.3.4'));
  });

  it('separates two user agents behind one address', () => {
    const now = new Date('2026-08-04T10:00:00Z');
    expect(hashSession('1.2.3.4', 'Chrome', now)).not.toBe(hashSession('1.2.3.4', 'Safari', now));
  });
});

describe('a missing salt', () => {
  it('warns and uses a random one rather than falling back to a constant', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    delete process.env.PRIVACY_SALT;
    __resetSaltForTests();
    const first = hashIp('1.2.3.4');
    expect(warn).toHaveBeenCalledOnce();

    __resetSaltForTests();
    // A new process-lifetime salt: the value changes, and at no point is it a
    // value an attacker could have computed from the repository.
    expect(hashIp('1.2.3.4')).not.toBe(first);
  });

  it('treats a too-short salt as missing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.PRIVACY_SALT = 'short';
    __resetSaltForTests();
    const a = hashIp('1.2.3.4');
    __resetSaltForTests();
    expect(hashIp('1.2.3.4')).not.toBe(a);
  });
});
