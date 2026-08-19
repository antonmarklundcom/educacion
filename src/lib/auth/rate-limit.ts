/**
 * Rate limiting for the sign-in endpoint (PR-42).
 *
 * The 2026-08 audit's one security inconsistency: `checkRate` already guarded
 * the password-reset form, the claim request, the lead form and the event
 * beacon, while `/ingresar` — the only endpoint where guessing succeeds
 * outright — called `authenticate()` bare.
 *
 * ### Why there is no global per-address limit
 *
 * The obvious design, and the one the brief names, is "per IP **plus** per
 * email". A global per-email counter with a hard refusal is a remote account
 * lockout, and a cheap one: the key is a string the attacker types, rejected
 * attempts are still charged, so ~21 requests an hour — a fifth of the IP
 * budget, from one ordinary address, no header spoofing — holds any account
 * the attacker can name locked out indefinitely. The victim's own retries top
 * the window back up. That is a denial-of-service tool wearing a rate
 * limiter's clothes, and it is worse than the attack it prevents: online
 * password guessing is already bounded by the KDF's cost, whereas locking a
 * paying institution out of its own panel during admissions is not.
 *
 * So the second tier is keyed on **(address, IP) together**. It still stops
 * one machine grinding one account, which is the realistic attack, and an
 * attacker can only ever lock out a pair they already control. The protection
 * a global counter would have added — one dictionary spread thin across a
 * botnet — is deliberately not bought at the price of handing every visitor a
 * lockout button. `risks.md` and `architecture.md` §6.1.1 record the trade.
 *
 * ### Why only failures are charged
 *
 * `checkRate` records every attempt, success included. On a credential
 * endpoint that is backwards: a school lab or a cyber café — the exact case
 * §6.1 says the limits must tolerate — would lock itself out by *signing in
 * successfully*. So this module peeks before the attempt, charges only a
 * failure, and clears the pair key on success, so somebody who mistyped twice
 * and then got it right starts clean.
 *
 * The IP itself is hashed by `clientIpHash()` in `@/lib/privacy/request`,
 * which every abuse-limited action shares. `x-forwarded-for` is
 * client-forgeable, so this tier is defeated by rotating it — the same caveat
 * §6.1 states for the lead form. It raises the cost of a flood; the password
 * hash's own cost is what actually bounds guessing.
 *
 * ### What is deliberately untouched
 *
 * The failure path. A request that reaches `authenticate()` still returns
 * `LOGIN_ERROR` after the decoy hash, with the same timing for an unknown
 * address as for a wrong password. The rate-limit message is separate,
 * describes the request rather than the credentials, and names nothing about
 * an account — and its key is chosen entirely by the caller, so the fact that
 * rejection is *fast* leaks nothing.
 */

import { clearRate, peekRate, recordRate, type RateLimitRule } from '@/lib/leads/rate-limit';
import { hashEmail } from '@/lib/privacy/hash';

/**
 * Deliberately looser than the reset form's 3/minute: a reset costs somebody
 * else an email, a failed sign-in costs a hash, and only failures are charged
 * here. Loose enough for a shared address, per §6.1.
 */
export const LOGIN_IP_RULES: RateLimitRule[] = [
  { limit: 10, windowMs: 60_000 },
  { limit: 60, windowMs: 3_600_000 },
];

/**
 * Per (address, IP). Tighter, because ten failures against one account from
 * one machine in a minute is not a person who forgot their password.
 */
export const LOGIN_ACCOUNT_RULES: RateLimitRule[] = [
  { limit: 5, windowMs: 60_000 },
  { limit: 20, windowMs: 3_600_000 },
];

/**
 * Distinct from `LOGIN_ERROR` on purpose: it describes the request, not the
 * credentials, and says nothing about whether the address exists.
 */
export const LOGIN_RATE_LIMITED = 'Demasiados intentos. Esperá unos minutos y probá de nuevo.';

/** The two keys one sign-in attempt is charged against. */
function keysFor(ipHash: string, email: string): { ip: string; account: string } {
  // Hashed because this map outlives the request, and a plaintext address
  // sitting in it is PII we never agreed to hold. `hashEmail` normalises case
  // and whitespace, so capitalising a letter cannot buy a fresh quota.
  return {
    ip: `login-ip:${ipHash}`,
    account: `login-account:${ipHash}:${hashEmail(email)}`,
  };
}

/**
 * May this attempt proceed? Charges nothing — call `recordLoginFailure` or
 * `clearLoginRate` once the attempt has an outcome.
 */
export function loginAllowed(ipHash: string, email: string, now: number = Date.now()): boolean {
  const keys = keysFor(ipHash, email);
  return (
    peekRate(keys.ip, now, LOGIN_IP_RULES).allowed &&
    peekRate(keys.account, now, LOGIN_ACCOUNT_RULES).allowed
  );
}

/** Charge a failed attempt against both keys. */
export function recordLoginFailure(ipHash: string, email: string, now: number = Date.now()): void {
  const keys = keysFor(ipHash, email);
  recordRate(keys.ip, now, LOGIN_IP_RULES);
  recordRate(keys.account, now, LOGIN_ACCOUNT_RULES);
}

/**
 * Forget the account key after a successful sign-in.
 *
 * The IP key is deliberately **not** cleared: an attacker who owns one valid
 * account could otherwise reset their own IP budget at will and grind the rest
 * of the catalog for free.
 */
export function clearLoginRate(ipHash: string, email: string): void {
  clearRate(keysFor(ipHash, email).account);
}
