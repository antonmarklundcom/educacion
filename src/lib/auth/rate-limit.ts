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
 * one machine grinding one account, which is the realistic attack, and it
 * raises the price of a lockout from "know the address" to "know the address
 * *and* the IP it will be used from". Stated precisely, because the weaker
 * claim is tempting: this is a higher bar, not an impossibility —
 * `x-forwarded-for` is forgeable, so somebody who knows an institution's
 * office IP can still construct the pair. And the IP tier is itself a lockout
 * of everyone behind an address, which is true of every IP-keyed limiter in
 * this codebase. What makes both survivable, and what v1 lacked, is that a
 * blocked key is no longer charged: it drains, instead of being held down by
 * the victim's own retries. `architecture.md` §6.1.1 and `risks.md` §R-16
 * record the trade.
 *
 * ### Charge first, refund a success
 *
 * `checkRate` records every attempt, success included. On a credential
 * endpoint that is backwards: a school lab or a cyber café — the exact case
 * §6.1 says the limits must tolerate — would lock itself out by *signing in
 * successfully*. But the obvious repair, "peek now and charge the failure
 * afterwards", is worse: discovering the outcome takes three `await`s, and
 * every concurrent request peeks before any of them records, so the limit
 * stops binding at all — a burst is then bounded only by the attacker's
 * connection count, on the one endpoint that runs a deliberately expensive
 * KDF.
 *
 * So the attempt is charged at decision time — `loginAllowed` and
 * `chargeLoginAttempt` are both synchronous and adjacent, which is atomic on
 * one event loop — and a success is *refunded*: the pair key is cleared
 * outright, and the one IP timestamp is given back. Failures stay charged,
 * successes cost nothing once settled, and a concurrent burst is counted as it
 * arrives. The cost of charging first is that a charge is held for the length
 * of the attempt, so the per-minute rules are concurrency caps too — which is
 * why `LOGIN_IP_RULES`' burst limit is as high as it is.
 *
 * The IP itself is hashed by `clientIpHash()` in `@/lib/privacy/server-request`,
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

import {
  clearRate,
  peekRate,
  recordRate,
  refundRate,
  type RateLimitRule,
} from '@/lib/leads/rate-limit';
import { hashEmail } from '@/lib/privacy/hash';

/**
 * The hourly rule is the one that binds. The burst rule is deliberately high
 * because charging on entry makes it a **concurrency** cap as well as a rate
 * cap: an attempt holds its charge until `authenticate()` returns, and that is
 * the slowest request on the site by design. At 10/minute, an eleventh person
 * pressing "Ingresar" within the same moment — ordinary at the start of a day
 * behind one school, café or office NAT, which is the case §6.1 promises to
 * tolerate — was refused with a correct password. 30 leaves that headroom
 * while 60/hour still bounds a sustained attack.
 */
export const LOGIN_IP_RULES: RateLimitRule[] = [
  { limit: 30, windowMs: 60_000 },
  { limit: 60, windowMs: 3_600_000 },
];

/**
 * Per (address, IP). Tighter, because five failures against one account from
 * one machine in a minute is not a person who forgot their password. It caps
 * simultaneous in-flight attempts on one account at five too (see
 * `LOGIN_IP_RULES`), which no legitimate person reaches — two tabs and a
 * phone is three.
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
 * May this attempt proceed? Charges nothing on its own — it must be followed
 * immediately, with no `await` between, by `chargeLoginAttempt`.
 */
export function loginAllowed(ipHash: string, email: string, now: number = Date.now()): boolean {
  const keys = keysFor(ipHash, email);
  return (
    peekRate(keys.ip, now, LOGIN_IP_RULES).allowed &&
    peekRate(keys.account, now, LOGIN_ACCOUNT_RULES).allowed
  );
}

/**
 * Charge the attempt against both keys, before its outcome is known. Pass the
 * same `now` given to `loginAllowed`, so the pair is atomic and so a success
 * can refund exactly this timestamp.
 */
export function chargeLoginAttempt(ipHash: string, email: string, now: number): void {
  const keys = keysFor(ipHash, email);
  recordRate(keys.ip, now, LOGIN_IP_RULES);
  recordRate(keys.account, now, LOGIN_ACCOUNT_RULES);
}

/**
 * Give back an attempt that was never actually verified — the database was
 * unreachable, or the hash comparison threw. Refunds both keys rather than
 * clearing them, so the failures around it survive.
 *
 * Safe against abuse because a throw here is not caller-inducible: the
 * failure is ours, not something an attacker can provoke to sign-in for free.
 * Without it, one database blip spends every waiting user's quota and then
 * tells them they tried too often.
 */
export function refundLoginAttempt(ipHash: string, email: string, now: number): void {
  const keys = keysFor(ipHash, email);
  refundRate(keys.ip, now);
  refundRate(keys.account, now);
}

/**
 * Settle a successful sign-in: forget the pair key entirely, and give back the
 * IP attempt this sign-in charged.
 *
 * The IP key is refunded by one timestamp rather than **cleared**: clearing it
 * would let an attacker who owns one valid account reset their whole IP budget
 * at will and grind the rest of the catalog for free. Refunding only what this
 * attempt cost means a success is free without being a reset.
 */
export function settleLoginSuccess(ipHash: string, email: string, now: number): void {
  const keys = keysFor(ipHash, email);
  clearRate(keys.account);
  refundRate(keys.ip, now);
}
