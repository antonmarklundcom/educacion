/**
 * Reading the two request facts the lead pipeline is allowed to use: the
 * client IP and the origin it claims to come from.
 *
 * ### The client IP on Hostinger
 *
 * The app runs behind Hostinger's proxy, so `request` has no socket address we
 * can see — the real client is in `x-forwarded-for`, whose *first* entry is the
 * client and whose remaining entries are proxies. The header is trivially
 * forgeable by the client, which matters: a spammer can rotate it and defeat
 * the per-IP tier entirely. That is a known and accepted limit, and it is
 * exactly why the durable quota is per *phone* — a number the submitter has to
 * keep if the lead is to be worth anything to them.
 *
 * ### The origin check
 *
 * A browser sets `Origin` on every cross-site POST and cannot be talked out of
 * it, so requiring it to match our own host blocks the whole class of forms
 * hosted elsewhere posting into our endpoint. It is not a defence against a
 * script — curl simply sends the right header — and is not treated as one.
 */

/** `PUBLIC_SITE_URL` is the deployed origin; unset in CI and in local dev. */
function configuredHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.PUBLIC_SITE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}

import { hashIp } from './hash';

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * The client IP from an already-resolved header list, hashed — for the server
 * actions, which have `headers()` rather than a `Request`.
 *
 * `x-forwarded-for` is client-forgeable and Hostinger's proxy appends rather
 * than replaces, so the leftmost entry is attacker-supplied: this raises the
 * cost of a flood, it does not make one impossible (`architecture.md` §6.1).
 */
export function hashClientIp(headerList: Headers): string {
  const forwarded = headerList.get('x-forwarded-for')?.split(',')[0]?.trim();
  return hashIp(forwarded || headerList.get('x-real-ip')?.trim() || 'unknown');
}

export function userAgent(request: Request): string {
  return request.headers.get('user-agent')?.slice(0, 320) ?? '';
}

/**
 * True when the request plausibly came from a page on this site.
 *
 * A missing `Origin` is rejected on a POST: every browser sends it, so its
 * absence means the caller is not one. The `Host` header is the fallback
 * comparison because the deployed origin is not configured in every
 * environment, and refusing every lead on an unconfigured deploy would be a
 * worse failure than accepting one from a host we could not double-check.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }

  const expected = configuredHost();
  if (expected) return originHost === expected;

  const host = request.headers.get('host')?.toLowerCase();
  return Boolean(host) && originHost === host;
}
