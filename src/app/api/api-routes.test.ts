/**
 * Every public API route refuses bad input before anything runs (PR-51).
 *
 * The audit's gap was the wiring: `submitLead`, `recordEvent`,
 * `parseClientReport` and `isAuthorizedCronRequest` are all tested as
 * functions, and nothing tested that the handlers actually call them, in the
 * right order, on the paths that matter. A route that parsed the body before
 * checking the origin, or answered 500 where it should answer 400, would have
 * passed CI.
 *
 * One file rather than five: these are four handlers of a dozen lines each, and
 * the property under test is the same one in every case — **nothing reaches a
 * query or a third party until the request has been refused or accepted on its
 * own terms.**
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const submitLead = vi.fn();
const recordEvent = vi.fn();
const captureClientError = vi.fn();

vi.mock('@/lib/leads', () => ({ submitLead: (...a: unknown[]) => submitLead(...a) }));
vi.mock('@/lib/events', () => ({ recordEvent: (...a: unknown[]) => recordEvent(...a) }));
vi.mock('@/lib/observability/capture', () => ({
  captureClientError: (...a: unknown[]) => captureClientError(...a),
}));

const { POST: leadsPost } = await import('./leads/route');
const { POST: eventsPost } = await import('./events/route');
const { POST: clientErrorPost } = await import('./client-error/route');
const { GET: revalidateGet, POST: revalidatePost } = await import('./revalidate/route');
const { GET: cronGet } = await import('./cron/[job]/route');

const ORIGIN = 'https://educacion.com.py';

/** A same-origin POST from a browser on this site. */
function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      host: 'educacion.com.py',
      'content-type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  submitLead.mockReset().mockResolvedValue({ ok: true });
  recordEvent.mockReset().mockResolvedValue(undefined);
  captureClientError.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/leads', () => {
  it('answers 400 on a body that is not JSON, without calling the pipeline', async () => {
    const response = await leadsPost(post(`${ORIGIN}/api/leads`, 'not json at all'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'invalid_payload' });
    expect(submitLead).not.toHaveBeenCalled();
  });

  it('hands a parsed body to the pipeline with the request itself', async () => {
    const body = { offeringId: 1 };
    const request = post(`${ORIGIN}/api/leads`, body);
    await leadsPost(request);
    expect(submitLead).toHaveBeenCalledWith(request, body);
  });

  it('maps the pipeline’s refusals onto the statuses the modal reads', async () => {
    const cases: Array<[string, number]> = [
      ['invalid_payload', 400],
      ['invalid_phone', 400],
      ['consent_required', 400],
      ['invalid_origin', 403],
      ['rate_limited', 429],
    ];
    for (const [error, status] of cases) {
      submitLead.mockResolvedValue({ ok: false, error });
      const response = await leadsPost(post(`${ORIGIN}/api/leads`, {}));
      expect(response.status, error).toBe(status);
    }
  });

  it('answers 500 without leaking the error when the pipeline throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    submitLead.mockRejectedValue(
      new Error("Duplicate entry 'ana@example.com' for key 'leads.email'"),
    );

    const response = await leadsPost(post(`${ORIGIN}/api/leads`, {}));
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({ ok: false, error: 'server_error' });
    expect(JSON.stringify(payload)).not.toContain('ana@example.com');
    spy.mockRestore();
  });

  it('carries retry-after when the pipeline gave one', async () => {
    submitLead.mockResolvedValue({ ok: false, error: 'rate_limited', retryAfterSeconds: 42 });
    const response = await leadsPost(post(`${ORIGIN}/api/leads`, {}));
    expect(response.headers.get('retry-after')).toBe('42');
  });
});

describe('POST /api/events', () => {
  it('drops a cross-origin beacon without recording it', async () => {
    const request = post(
      `${ORIGIN}/api/events`,
      { type: 'whatsapp_click' },
      { origin: 'https://evil.example' },
    );
    const response = await eventsPost(request);
    expect(response.status).toBe(202);
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it('refuses an event type a browser may not claim', async () => {
    // `lead_submit` is written server-side: it is what an institution is
    // invoiced against, so a browser must not be able to assert one.
    await eventsPost(post(`${ORIGIN}/api/events`, { type: 'lead_submit', offeringId: 1 }));
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it('drops a malformed body rather than answering an error a prober could read', async () => {
    const response = await eventsPost(post(`${ORIGIN}/api/events`, 'garbage'));
    expect(response.status).toBe(202);
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it('nulls ids that are not positive integers instead of passing them on', async () => {
    await eventsPost(
      post(`${ORIGIN}/api/events`, { type: 'whatsapp_click', offeringId: -3, institutionId: 'x' }),
    );
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'whatsapp_click', offeringId: null, institutionId: null }),
    );
  });

  it('answers 202 for an accepted beacon, with no body to probe', async () => {
    const response = await eventsPost(
      post(`${ORIGIN}/api/events`, { type: 'whatsapp_click', offeringId: 5, institutionId: 9 }),
    );
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
    expect(recordEvent).toHaveBeenCalled();
  });
});

describe('POST /api/client-error', () => {
  it('drops a cross-origin report without forwarding it', async () => {
    const response = await clientErrorPost(
      post(`${ORIGIN}/api/client-error`, { message: 'boom' }, { origin: 'https://evil.example' }),
    );
    expect(response.status).toBe(204);
    expect(captureClientError).not.toHaveBeenCalled();
  });

  it('drops a body that does not parse as a report', async () => {
    const response = await clientErrorPost(post(`${ORIGIN}/api/client-error`, { nothing: true }));
    expect(response.status).toBe(204);
    expect(captureClientError).not.toHaveBeenCalled();
  });

  it('answers 204 either way, so the endpoint cannot be probed', async () => {
    const accepted = await clientErrorPost(
      post(`${ORIGIN}/api/client-error`, { message: 'ReferenceError: x is not defined' }),
    );
    expect(accepted.status).toBe(204);
    expect(await accepted.text()).toBe('');
  });
});

describe('/api/revalidate', () => {
  it('is still a skeleton and says so on both verbs', async () => {
    for (const response of [await revalidateGet(), await revalidatePost()]) {
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'not_implemented' });
    }
  });
});

describe('GET /api/cron/[job]', () => {
  const params = (job: string) => ({ params: Promise.resolve({ job }) });

  it('refuses a request with no secret, whatever the job', async () => {
    delete process.env.CRON_SECRET;
    const response = await cronGet(
      new Request(`${ORIGIN}/api/cron/lead-digest`),
      params('lead-digest'),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ status: 'unauthorized' });
  });

  it('refuses a wrong secret', async () => {
    process.env.CRON_SECRET = 'the-real-one';
    const response = await cronGet(
      new Request(`${ORIGIN}/api/cron/lead-digest`, { headers: { 'x-cron-secret': 'guess' } }),
      params('lead-digest'),
    );
    expect(response.status).toBe(401);
    delete process.env.CRON_SECRET;
  });

  it('refuses before it looks at the job name, so an unknown job is not an oracle', async () => {
    delete process.env.CRON_SECRET;
    const response = await cronGet(new Request(`${ORIGIN}/api/cron/nope`), params('nope'));
    await expect(response.json()).resolves.toEqual({ status: 'unauthorized' });
  });
});
