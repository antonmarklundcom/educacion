import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `robots.ts` is the belt to the middleware's braces (`docs/domains.md` §1):
 * a crawler that reaches a non-canonical host before DNS settles, or before a
 * cached `robots.txt` expires, must be told to index nothing. PR-60 shipped
 * that branch with no test, so deleting it left the suite green.
 */

let requestHeaders = new Headers();
vi.mock('next/headers', () => ({ headers: async () => requestHeaders }));

const SITE_URL = 'https://educacion.com.py';

async function robotsFor(host: string, siteUrl: string | undefined = SITE_URL) {
  vi.resetModules();
  if (siteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = siteUrl;
  requestHeaders = new Headers({ host });
  const mod = await import('./robots');
  return mod.default();
}

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;
});
afterEach(() => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe('robots on a non-canonical host', () => {
  it.each([
    ['the Hostinger preview', 'silver-goshawk-568437.hostingersite.com'],
    ['universidad.com.py', 'universidad.com.py'],
    ['the www. variant', 'www.educacion.com.py'],
  ])('disallows everything on %s', async (_label, host) => {
    const result = await robotsFor(host);
    expect(result.rules).toEqual({ userAgent: '*', disallow: '/' });
    expect(result.sitemap).toBeUndefined();
  });
});

describe('robots on the canonical host', () => {
  it('serves the real rules and the sitemap', async () => {
    const result = await robotsFor('educacion.com.py');
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(result.rules).toMatchObject({ userAgent: '*', allow: '/' });
  });

  it('ignores the port, so a ported canonical is not disallowed', async () => {
    const result = await robotsFor('localhost:3000', 'http://localhost:3000');
    expect(result.sitemap).toBe('http://localhost:3000/sitemap.xml');
  });
});
