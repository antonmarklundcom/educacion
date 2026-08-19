/**
 * Rate limiting for the credential endpoints (PR-42).
 *
 * The 2026-08 audit's one security inconsistency: `checkRate` already guarded
 * the password-reset form, the claim request, the lead form and the event
 * beacon, while `/ingresar` — the only endpoint where guessing succeeds
 * outright — called `authenticate()` bare. This module closes that, and owns
 * the shared pieces so the two auth actions cannot drift apart.
 *
 * ### Two keys, and why the email one is not an oracle
 *
 * Per hashed IP stops one machine grinding a dictionary. Per submitted email
 * stops a botnet spreading the same dictionary across many machines, which the
 * IP tier alone cannot see.
 *
 * The email tier is keyed on **what was submitted**, before any lookup, so it
 * behaves identically for an address that exists and one that does not. Keying
 * it on "accounts we found" would have turned the limiter itself into the user
 * enumeration oracle that `login.ts`'s decoy hash exists to prevent — the
 * rejection would only ever appear for real addresses.
 *
 * ### Why rejection is allowed to be fast
 *
 * `login.ts` burns a hash on every miss so the unknown-email path costs what
 * the wrong-password path costs. A rate-limit rejection returns before any of
 * that and is therefore quick — which leaks nothing, because both keys are
 * chosen by the caller. What must not change is the *failure* path: a request
 * that reaches `authenticate()` still gets the uniform message and the uniform
 * timing. This module never touches either.
 */

import { headers } from 'next/headers';

import { checkRate, type RateLimitDecision, type RateLimitRule } from '@/lib/leads/rate-limit';
import { hashEmail, hashIp } from '@/lib/privacy/hash';

/**
 * Deliberately looser than the reset form's 3/minute. A reset request costs
 * somebody else an email; a failed sign-in costs nothing but a hash, and a
 * person who has genuinely forgotten which of three passwords they used must
 * not be locked out of their own panel mid-morning.
 */
export const LOGIN_IP_RULES: readonly RateLimitRule[] = [
  { limit: 10, windowMs: 60_000 },
  { limit: 60, windowMs: 3_600_000 },
];

/**
 * Tighter than the IP tier: ten people behind one office NAT is ordinary, ten
 * failed attempts on one address in a minute is not.
 */
export const LOGIN_EMAIL_RULES: readonly RateLimitRule[] = [
  { limit: 5, windowMs: 60_000 },
  { limit: 20, windowMs: 3_600_000 },
];

/**
 * Distinct from `LOGIN_ERROR` on purpose. It describes the request, not the
 * credentials, and says nothing about whether the address exists — every
 * caller of this endpoint can reach it with any input.
 */
export const LOGIN_RATE_LIMITED = 'Demasiados intentos. Esperá unos minutos y probá de nuevo.';

/**
 * The client IP, hashed. Shared by the login and reset actions — it was
 * duplicated in the reset action before this PR, and a second copy is how two
 * endpoints quietly stop hashing the same thing.
 */
export async function clientIpHash(): Promise<string> {
  const header = await headers();
  const forwarded = header.get('x-forwarded-for')?.split(',')[0]?.trim();
  return hashIp(forwarded || header.get('x-real-ip')?.trim() || 'unknown');
}

/**
 * Both tiers, IP first.
 *
 * IP is checked first so a flood is stopped by the cheapest key, and the email
 * tier records nothing once the IP is already blocked — otherwise a blocked
 * attacker would still consume the quota of every address they name, locking
 * real users out of their own accounts. That ordering is the difference
 * between a rate limit and a denial-of-service tool.
 */
export function checkLoginRate(
  ipHash: string,
  email: string,
  now: number = Date.now(),
): RateLimitDecision {
  const byIp = checkRate(`login-ip:${ipHash}`, now, [...LOGIN_IP_RULES]);
  if (!byIp.allowed) return byIp;

  return checkRate(`login-email:${hashEmail(email)}`, now, [...LOGIN_EMAIL_RULES]);
}
