/**
 * `requestClaimAction`'s three defences (PR-51).
 *
 * This is the one door into the panel that opens from outside, unauthenticated
 * by design, and it writes a row and sends mail to an address the submitter
 * chooses. Its action therefore has to apply the request-shaped checks itself —
 * a Server Action is a POST endpoint reachable without ever rendering the form
 * — and this asserts the order they happen in: origin, rate, shape, and only
 * then `requestClaim`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestClaim = vi.fn();
let requestHeaders = new Headers();

vi.mock('@/lib/claims', async () => {
  const actual = await vi.importActual<typeof import('@/lib/claims')>('@/lib/claims');
  return { ...actual, requestClaim: (...a: unknown[]) => requestClaim(...a) };
});
vi.mock('next/headers', () => ({ headers: async () => requestHeaders }));

const { requestClaimAction } = await import('./actions');

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

let ip = 0;

beforeEach(() => {
  ip += 1;
  // A distinct forwarded address per test: the rate limiter is in-process and
  // allows three requests a minute, which several of these tests would spend.
  requestHeaders = new Headers({ 'x-forwarded-for': `203.0.113.${ip}` });
  requestClaim.mockReset().mockResolvedValue({
    outcome: 'emailed',
    email: 'rector@una.py',
    institutionName: 'UNA',
  });
});

describe('origin', () => {
  it('refuses a form posted from another site, before anything is written', async () => {
    requestHeaders = new Headers({ origin: 'https://evil.example', host: 'educacion.com.py' });
    const state = await requestClaimAction('una', {}, form({ email: 'rector@una.py' }));
    expect(state.error).toBeTruthy();
    expect(requestClaim).not.toHaveBeenCalled();
  });

  it('accepts a same-origin post', async () => {
    requestHeaders = new Headers({
      origin: 'https://educacion.com.py',
      host: 'educacion.com.py',
      'x-forwarded-for': '203.0.113.200',
    });
    await requestClaimAction('una', {}, form({ email: 'rector@una.py' }));
    expect(requestClaim).toHaveBeenCalled();
  });
});

describe('bad input never reaches a query', () => {
  it.each([
    ['no email at all', {}],
    ['a blank email', { email: '   ' }],
    ['something that is not an address', { email: 'rector' }],
    ['an address longer than the column', { email: `${'a'.repeat(260)}@una.py` }],
    ['a note past its limit', { email: 'rector@una.py', note: 'x'.repeat(501) }],
    ['a contact name past its limit', { email: 'rector@una.py', contactName: 'x'.repeat(161) }],
  ])('refuses %s', async (_case, entries) => {
    const state = await requestClaimAction('una', {}, form(entries as Record<string, string>));
    expect(state.error).toBeTruthy();
    expect(requestClaim).not.toHaveBeenCalled();
  });
});

describe('what reaches the query', () => {
  it('carries the slug and the trimmed fields through intact', async () => {
    await requestClaimAction(
      'universidad-nacional',
      {},
      form({ email: ' rector@una.py ', contactName: ' Ana Rectora ', note: ' Soy la rectora ' }),
    );
    expect(requestClaim).toHaveBeenCalledWith({
      institutionSlug: 'universidad-nacional',
      email: 'rector@una.py',
      contactName: 'Ana Rectora',
      note: 'Soy la rectora',
    });
  });

  it('sends null rather than an empty string for the optional fields', async () => {
    await requestClaimAction(
      'una',
      {},
      form({ email: 'rector@una.py', contactName: '', note: '  ' }),
    );
    expect(requestClaim).toHaveBeenCalledWith(
      expect.objectContaining({ contactName: null, note: null }),
    );
  });
});
