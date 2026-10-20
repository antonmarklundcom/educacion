import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendLeadToVenderCrm, venderCrmIdempotencyKey, venderCrmPayload } from './vendercrm';

const lead = {
  leadId: 7,
  phoneE164: '+595981123456',
  name: 'Ana',
  email: null,
  message: null,
  institutionName: 'Universidad Ejemplo',
  programName: 'Medicina',
  offeringId: 42,
  ageBracket: '18_24',
  sourcePage: null,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('venderCrmPayload', () => {
  it('omits empty optional fields and never routes', () => {
    const body = venderCrmPayload(lead);
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('message');
    expect(body).not.toHaveProperty('page_url');
    for (const key of ['pipeline', 'stage', 'owner', 'tag']) expect(body).not.toHaveProperty(key);
    expect(body.phone).toBe('+595981123456');
    expect(String(body.idempotency_key).length).toBeGreaterThanOrEqual(8);
  });

  it('keys idempotency on phone, offering and hour', () => {
    const at = new Date('2026-10-20T13:05:00Z');
    const later = new Date('2026-10-20T13:55:00Z');
    expect(venderCrmIdempotencyKey('+595981123456', 42, at)).toBe(
      venderCrmIdempotencyKey('+595981123456', 42, later),
    );
    expect(venderCrmIdempotencyKey('+595981123456', 42, at)).not.toBe(
      venderCrmIdempotencyKey('+595981123456', 43, at),
    );
  });
});

describe('sendLeadToVenderCrm', () => {
  it('does nothing without a key', async () => {
    vi.stubEnv('VENDERCRM_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendLeadToVenderCrm(lead)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts with the key header and never throws on failure', async () => {
    vi.stubEnv('VENDERCRM_API_KEY', 'test-key');
    vi.stubEnv('VENDERCRM_URL', 'https://crm.example.test/');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendLeadToVenderCrm(lead)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://crm.example.test/api/v1/leads');
    expect((init as RequestInit).headers).toMatchObject({ 'x-api-key': 'test-key' });

    fetchMock.mockRejectedValueOnce(new Error('down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sendLeadToVenderCrm(lead)).toBe(false);
  });
});
