/**
 * `/api/client-error` (PR-45) — a public, unauthenticated endpoint that
 * forwards to a third-party service on a shared quota, so its refusals are the
 * feature.
 *
 * The capture is mocked; the rate limiter, the parser and the byte cap are not.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureClientError = vi.fn();
vi.mock('@/lib/observability/capture', () => ({
  captureClientError: (...args: unknown[]) => captureClientError(...args),
}));

const { POST } = await import('./route');
const { __resetRateLimitForTests } = await import('@/lib/leads/rate-limit');

/** A distinct IP per test, so one test's quota is not another's. */
let ipCounter = 0;
function post(body: unknown, ip = `10.0.0.${(ipCounter += 1)}`): Promise<Response> {
  return POST(
    new Request('https://educacion.com.py/api/client-error', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': ip,
        origin: 'https://educacion.com.py',
        host: 'educacion.com.py',
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

const VALID = { name: 'TypeError', message: 'x is not a function', path: '/carreras' };

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitForTests();
});

afterEach(() => {
  __resetRateLimitForTests();
});

describe('POST /api/client-error', () => {
  it('refuses a request with no Origin, which no browser sends', async () => {
    // The same first gate the lead endpoint uses. Forgeable by a script, which
    // is why `capture.ts` holds the bound that is not.
    const response = await POST(
      new Request('https://educacion.com.py/api/client-error', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'educacion.com.py' },
        body: JSON.stringify(VALID),
      }),
    );
    expect(response.status).toBe(204);
    expect(captureClientError).not.toHaveBeenCalled();
  });

  it('refuses a request from another origin', async () => {
    const response = await POST(
      new Request('https://educacion.com.py/api/client-error', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          host: 'educacion.com.py',
          origin: 'https://evil.example',
        },
        body: JSON.stringify(VALID),
      }),
    );
    expect(response.status).toBe(204);
    expect(captureClientError).not.toHaveBeenCalled();
  });

  it('returns a fresh response object each time', async () => {
    // A module-level `NextResponse` singleton is mutated per request by Next,
    // so two concurrent handlers would share and accumulate headers.
    const a = await post(VALID);
    const b = await post(VALID);
    expect(a).not.toBe(b);
  });

  it('refuses an oversized body by its declared length, before reading it', async () => {
    const response = await POST(
      new Request('https://educacion.com.py/api/client-error', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          host: 'educacion.com.py',
          origin: 'https://educacion.com.py',
          'content-length': '5000000',
        },
        body: JSON.stringify(VALID),
      }),
    );
    expect(response.status).toBe(204);
    expect(captureClientError).not.toHaveBeenCalled();
  });

  it('counts bytes, not UTF-16 units', async () => {
    // 8 000 emoji is 8 000 `String.length` and 32 kB on the wire; a naive
    // length check would have let it through.
    await post({ message: 'x', stack: '🙂'.repeat(4_000) });
    expect(captureClientError).not.toHaveBeenCalled();
  });

  it('accepts a report and hands it to the capture', async () => {
    const response = await post(VALID);
    expect(response.status).toBe(204);
    expect(captureClientError).toHaveBeenCalledTimes(1);
    expect(captureClientError).toHaveBeenCalledWith(expect.objectContaining({ name: 'TypeError' }));
  });

  it('answers 204 to everything, so it cannot be probed', async () => {
    // A reporter that says "accepted" or "rejected" tells a script what shape
    // to send, and there is nothing a browser could do with the answer.
    for (const body of [VALID, {}, 'not json', { name: 'x' }, []]) {
      expect((await post(body)).status).toBe(204);
    }
  });

  it('does not capture a body that says nothing', async () => {
    await post({});
    await post({ name: 'Error' });
    await post([1, 2, 3]);
    expect(captureClientError).not.toHaveBeenCalled();
  });

  it('does not capture unparseable JSON', async () => {
    await post('{ this is not json');
    expect(captureClientError).not.toHaveBeenCalled();
  });

  it('refuses an oversized body before parsing it', async () => {
    const huge = JSON.stringify({ message: 'x', stack: 'S'.repeat(200_000) });
    expect(huge.length).toBeGreaterThan(8_192);
    await post(huge);
    expect(
      captureClientError,
      'a megabyte must not be parsed to be rejected',
    ).not.toHaveBeenCalled();
  });

  it('rate limits a crashing browser', async () => {
    const ip = '10.9.9.9';
    for (let i = 0; i < 20; i += 1) await post(VALID, ip);
    // 5 per minute; the limiter charges the attempt that trips it too.
    expect(captureClientError.mock.calls.length).toBeLessThanOrEqual(6);
    expect(captureClientError.mock.calls.length).toBeGreaterThan(0);
  });

  it("does not let one browser's loop silence another visitor", async () => {
    const noisy = '10.9.9.8';
    for (let i = 0; i < 20; i += 1) await post(VALID, noisy);
    captureClientError.mockClear();
    await post(VALID, '10.9.9.7');
    expect(captureClientError).toHaveBeenCalledTimes(1);
  });

  it('never passes through a field the contract does not name', async () => {
    await post({ ...VALID, cookies: 'educacion_session=abc', phone: '+595981123456' });
    const [report] = captureClientError.mock.calls[0];
    expect(JSON.stringify(report)).not.toContain('educacion_session');
    expect(JSON.stringify(report)).not.toContain('981123456');
  });
});
