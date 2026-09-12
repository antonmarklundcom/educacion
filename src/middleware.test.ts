import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { canonicalRedirectUrl, isExemptPath, normalizeHost, requestHost } from './middleware';

const SITE_URL = 'https://educacion.com.py';

describe('normalizeHost', () => {
  it('lower-cases and strips the port', () => {
    expect(normalizeHost('Educacion.com.py:3000')).toBe('educacion.com.py');
  });

  it('takes the first entry of a comma-separated list', () => {
    expect(normalizeHost('educacion.com.py, preview.hostingersite.com')).toBe('educacion.com.py');
  });

  it('is null for a missing header', () => {
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
    expect(normalizeHost('')).toBeNull();
  });
});

describe('requestHost', () => {
  it('prefers x-forwarded-host over host', () => {
    const headers = new Headers({
      host: 'localhost:3000',
      'x-forwarded-host': 'www.educacion.com.py',
    });
    expect(requestHost(headers)).toBe('www.educacion.com.py');
  });

  it('falls back to host when x-forwarded-host is absent', () => {
    const headers = new Headers({ host: 'educacion.com.py' });
    expect(requestHost(headers)).toBe('educacion.com.py');
  });
});

describe('isExemptPath', () => {
  it('exempts cron jobs and the client-error beacon', () => {
    expect(isExemptPath('/api/cron/rebuild-search')).toBe(true);
    expect(isExemptPath('/api/client-error')).toBe(true);
  });

  it('does not exempt the OG image route', () => {
    expect(isExemptPath('/og/programa')).toBe(false);
  });

  it('does not exempt lookalike paths', () => {
    expect(isExemptPath('/api/crontab')).toBe(false);
  });
});

describe('canonicalRedirectUrl', () => {
  const headersFor = (host: string) => new Headers({ host });

  it('passes through a request already on the canonical host', () => {
    expect(canonicalRedirectUrl(headersFor('educacion.com.py'), '/carreras', '', SITE_URL)).toBeNull();
  });

  it('redirects www., preserving path and query', () => {
    expect(
      canonicalRedirectUrl(headersFor('www.educacion.com.py'), '/carreras', '?ciudad=asuncion', SITE_URL),
    ).toBe('https://educacion.com.py/carreras?ciudad=asuncion');
  });

  it('redirects the hostingersite.com preview host', () => {
    expect(
      canonicalRedirectUrl(
        headersFor('adorable-name-123456.hostingersite.com'),
        '/universidades',
        '',
        SITE_URL,
      ),
    ).toBe('https://educacion.com.py/universidades');
  });

  it('redirects universidad.com.py, path preserved', () => {
    expect(
      canonicalRedirectUrl(headersFor('universidad.com.py'), '/carreras/medicina', '', SITE_URL),
    ).toBe('https://educacion.com.py/carreras/medicina');
  });

  it('never redirects a cron path even on a non-canonical host', () => {
    expect(
      canonicalRedirectUrl(headersFor('universidad.com.py'), '/api/cron/rebuild-search', '', SITE_URL),
    ).toBeNull();
  });

  it('never redirects the client-error beacon', () => {
    expect(
      canonicalRedirectUrl(headersFor('universidad.com.py'), '/api/client-error', '', SITE_URL),
    ).toBeNull();
  });

  it('does not exempt the OG image route: a shared OG image must live on the canonical host', () => {
    expect(canonicalRedirectUrl(headersFor('universidad.com.py'), '/og/programa', '', SITE_URL)).toBe(
      'https://educacion.com.py/og/programa',
    );
  });

  it('passes through when NEXT_PUBLIC_SITE_URL is unset', () => {
    expect(canonicalRedirectUrl(headersFor('universidad.com.py'), '/carreras', '', undefined)).toBeNull();
  });

  it('passes through when NEXT_PUBLIC_SITE_URL is unparsable', () => {
    expect(canonicalRedirectUrl(headersFor('universidad.com.py'), '/carreras', '', 'not-a-url')).toBeNull();
  });

  // PR-52's defect, re-checked here: `x-forwarded-proto` can be a list
  // ("https,http" behind a proxy chain), but the redirect target is built
  // from `NEXT_PUBLIC_SITE_URL`'s own origin, never from the incoming
  // protocol — so a list value can never leak into `Location` at all.
  it('ignores x-forwarded-proto entirely; the target origin always comes from NEXT_PUBLIC_SITE_URL', () => {
    const headers = new Headers({
      host: 'www.educacion.com.py',
      'x-forwarded-proto': 'https,http',
    });
    const target = canonicalRedirectUrl(headers, '/carreras', '', SITE_URL);
    expect(target).toBe('https://educacion.com.py/carreras');
    expect(target).not.toContain(',');
  });

  it('no redirect loop is reachable: the target is always the canonical host', () => {
    const target = canonicalRedirectUrl(headersFor('www.educacion.com.py'), '/carreras', '', SITE_URL);
    expect(target).not.toBeNull();
    // Re-run the decision against the request the redirect points at: a
    // request whose host is already canonical must be a pass-through, so
    // feeding the redirected host back in can never produce another target.
    const redirectedHost = new URL(target!).host;
    expect(canonicalRedirectUrl(headersFor(redirectedHost), '/carreras', '', SITE_URL)).toBeNull();
  });

  // Regression, found in review: `canonicalOrigin` compared `URL.host`, which
  // carries the port, against a `requestHost()` that strips it. A canonical
  // URL with a port therefore matched nothing — including itself — so the
  // redirect target redirected again. `.env.example` ships
  // `http://localhost:3000`, so this was every local `npm run dev` request.
  describe('a canonical URL that carries a port', () => {
    const PORTED = 'http://localhost:3000';

    it('passes a request already on the canonical origin through', () => {
      expect(canonicalRedirectUrl(headersFor('localhost:3000'), '/carreras', '', PORTED)).toBeNull();
    });

    it('keeps the port on the redirect target', () => {
      expect(canonicalRedirectUrl(headersFor('127.0.0.1:3000'), '/carreras', '?a=1', PORTED)).toBe(
        'http://localhost:3000/carreras?a=1',
      );
    });

    it('cannot loop: the target it points at is a pass-through', () => {
      const target = canonicalRedirectUrl(headersFor('127.0.0.1:3000'), '/carreras', '', PORTED);
      const redirectedHost = new URL(target!).host;
      expect(canonicalRedirectUrl(headersFor(redirectedHost), '/carreras', '', PORTED)).toBeNull();
    });
  });
});

describe('canonicalOrigin warnings', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('warns at most once per process for a missing NEXT_PUBLIC_SITE_URL', async () => {
    const mod = await import('./middleware');
    mod.canonicalRedirectUrl(new Headers({ host: 'universidad.com.py' }), '/', '', undefined);
    mod.canonicalRedirectUrl(new Headers({ host: 'universidad.com.py' }), '/otra', '', undefined);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
