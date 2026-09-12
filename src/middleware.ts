import { NextResponse, type NextRequest } from 'next/server';

/**
 * Canonical-host enforcement (`docs/domains.md` §1, PR-60).
 *
 * `educacion.com.py` is the only host `NEXT_PUBLIC_SITE_URL` ever names. Two
 * hosts must never serve real content: the `*.hostingersite.com` preview
 * (still reachable after the custom domain is mapped) and `universidad.com.py`
 * (owned defensively, 301s here per path). `www.` counts as non-canonical
 * too — the domain was never registered with it.
 *
 * The decision is a pure function of two strings so it can be unit-tested
 * against `Request`-shaped inputs without spinning up the Next.js runtime;
 * `middleware()` itself only wires that function to the request and to
 * `NextResponse`.
 */

/** Exempt from the redirect: cron must never depend on DNS resolving. */
const EXEMPT_PATH_PREFIXES = ['/api/cron/', '/api/client-error'];

let warnedMissingSiteUrl = false;
let warnedUnparsableSiteUrl = '';

/** Lower-cased, port-stripped host, or `null` if the header/value is absent. */
export function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  if (!first) return null;
  return first.toLowerCase().replace(/:\d+$/, '');
}

/** The request's host per PR-60: `x-forwarded-host` first, then `host`. */
export function requestHost(headers: Headers): string | null {
  return normalizeHost(headers.get('x-forwarded-host')) ?? normalizeHost(headers.get('host'));
}

/**
 * The canonical host and origin derived from `NEXT_PUBLIC_SITE_URL`, or
 * `null` when the env var is unset or not a valid URL — in which case the
 * caller passes every request through rather than redirecting to nowhere.
 * Logs at most one warning per process per distinct cause, so a
 * long-running instance does not spam its logs on every request.
 */
export function canonicalOrigin(
  siteUrl: string | undefined,
): { host: string; origin: string } | null {
  if (!siteUrl) {
    if (!warnedMissingSiteUrl) {
      warnedMissingSiteUrl = true;
      console.warn(
        '[middleware] NEXT_PUBLIC_SITE_URL is unset; canonical-host redirect disabled.',
      );
    }
    return null;
  }
  try {
    const url = new URL(siteUrl);
    return { host: url.host.toLowerCase(), origin: url.origin };
  } catch {
    if (warnedUnparsableSiteUrl !== siteUrl) {
      warnedUnparsableSiteUrl = siteUrl;
      console.warn(`[middleware] NEXT_PUBLIC_SITE_URL is not a URL: ${siteUrl}`);
    }
    return null;
  }
}

export function isExemptPath(pathname: string): boolean {
  return EXEMPT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * The redirect target, or `null` when the request should pass through:
 * already on the canonical host, no resolvable canonical, or an exempt
 * path. Path and query are preserved verbatim onto the canonical origin —
 * never the incoming origin, so a canonical-host request can never produce
 * a redirect target that itself redirects (no loop is reachable).
 */
export function canonicalRedirectUrl(
  headers: Headers,
  pathname: string,
  search: string,
  siteUrl: string | undefined,
): string | null {
  if (isExemptPath(pathname)) return null;

  const canonical = canonicalOrigin(siteUrl);
  if (!canonical) return null;

  const host = requestHost(headers);
  if (!host || host === canonical.host) return null;

  return `${canonical.origin}${pathname}${search}`;
}

export function middleware(request: NextRequest) {
  const target = canonicalRedirectUrl(
    request.headers,
    request.nextUrl.pathname,
    request.nextUrl.search,
    process.env.NEXT_PUBLIC_SITE_URL,
  );
  if (target) {
    return NextResponse.redirect(target, 301);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
