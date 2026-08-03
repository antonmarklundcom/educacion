import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FetchError, USER_AGENT, __resetRateLimiter, politeFetchText } from './http';

const ok = (body: string, url = 'https://source.test/') =>
  ({ ok: true, status: 200, statusText: 'OK', url, text: async () => body }) as Response;

const fail = (status: number, url = 'https://source.test/') =>
  ({ ok: false, status, statusText: 'Err', url, text: async () => '' }) as Response;

const options = { delayMs: 0, sleepImpl: async () => {}, retries: 3 };

beforeEach(() => __resetRateLimiter());

describe('politeFetchText', () => {
  it('identifies itself with a contact URL so an admin can find out who we are', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok('body'));
    await politeFetchText('https://source.test/', { ...options, fetchImpl });

    const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['user-agent']).toBe(USER_AGENT);
    expect(headers['user-agent']).toContain('educacion.com.py');
  });

  it('returns the final URL after redirects, which is what we store', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(ok('body', 'https://source.test/final/'));
    const result = await politeFetchText('https://source.test/', { ...options, fetchImpl });
    expect(result.url).toBe('https://source.test/final/');
  });

  it('retries a 503 and succeeds', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(ok('body'));

    const result = await politeFetchText('https://source.test/', { ...options, fetchImpl });
    expect(result.body).toBe('body');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 403 — the government sites block whole networks, and hammering earns a permanent block', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(fail(403));

    await expect(
      politeFetchText('https://source.test/', { ...options, fetchImpl }),
    ).rejects.toThrow(FetchError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry budget', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(fail(500));
    await expect(
      politeFetchText('https://source.test/', { ...options, fetchImpl, retries: 2 }),
    ).rejects.toThrow(/500/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('serializes concurrent requests to one host so the delay cannot be bypassed', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return ok('body');
    });

    await Promise.all([
      politeFetchText('https://source.test/a', { ...options, fetchImpl }),
      politeFetchText('https://source.test/b', { ...options, fetchImpl }),
      politeFetchText('https://source.test/c', { ...options, fetchImpl }),
    ]);

    expect(maxInFlight).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not let one failed request poison the queue for the next', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(fail(403))
      .mockResolvedValueOnce(ok('second'));

    const first = politeFetchText('https://source.test/a', { ...options, fetchImpl });
    const second = politeFetchText('https://source.test/b', { ...options, fetchImpl });

    await expect(first).rejects.toThrow();
    await expect(second).resolves.toMatchObject({ body: 'second' });
  });
});
