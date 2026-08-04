import { afterEach, describe, expect, it } from 'vitest';

import { clientIp, isSameOrigin, userAgent } from './request';

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.PUBLIC_SITE_URL;
});

function req(headers: Record<string, string>): Request {
  return new Request('https://educacion.com.py/api/leads', { method: 'POST', headers });
}

describe('clientIp', () => {
  it('takes the first entry of x-forwarded-for — the client, not the proxy', () => {
    expect(clientIp(req({ 'x-forwarded-for': '190.128.1.5, 10.0.0.1, 10.0.0.2' }))).toBe(
      '190.128.1.5',
    );
  });

  it('falls back to x-real-ip and then to a constant', () => {
    expect(clientIp(req({ 'x-real-ip': '190.128.1.9' }))).toBe('190.128.1.9');
    expect(clientIp(req({}))).toBe('unknown');
  });
});

describe('isSameOrigin', () => {
  it('rejects a POST with no Origin at all — every browser sends one', () => {
    expect(isSameOrigin(req({ host: 'educacion.com.py' }))).toBe(false);
  });

  it('compares against the configured site URL when there is one', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://educacion.com.py';
    expect(isSameOrigin(req({ origin: 'https://educacion.com.py' }))).toBe(true);
    expect(isSameOrigin(req({ origin: 'https://educacion.com.py.evil.tld' }))).toBe(false);
    // A forged Host must not be able to talk us into accepting a foreign origin.
    expect(isSameOrigin(req({ origin: 'https://evil.tld', host: 'evil.tld' }))).toBe(false);
  });

  it('falls back to the Host header where the site URL is not configured', () => {
    expect(isSameOrigin(req({ origin: 'https://localhost:3000', host: 'localhost:3000' }))).toBe(
      true,
    );
    expect(isSameOrigin(req({ origin: 'https://evil.tld', host: 'localhost:3000' }))).toBe(false);
  });

  it('rejects an unparseable Origin', () => {
    expect(isSameOrigin(req({ origin: 'null', host: 'educacion.com.py' }))).toBe(false);
  });
});

describe('userAgent', () => {
  it('is bounded so it cannot overflow the column', () => {
    const long = 'x'.repeat(1000);
    expect(userAgent(req({ 'user-agent': long })).length).toBe(320);
    expect(userAgent(req({}))).toBe('');
  });
});
