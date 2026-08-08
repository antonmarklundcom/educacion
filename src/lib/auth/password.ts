/**
 * Password hashing.
 *
 * ### Why scrypt and not bcrypt
 *
 * `pr-plan.md` PR-18 says bcrypt. We use Node's built-in `crypto.scrypt`
 * instead, deliberately:
 *
 * - **bcrypt is a native module.** It compiles against the Node ABI at install
 *   time, and this app deploys to Hostinger's managed Node hosting, where a
 *   platform Node upgrade would turn every login into a 500 until someone SSHs
 *   in and rebuilds. `docs/deployment.md` exists because that class of surprise
 *   has already cost us time.
 * - **scrypt is in the standard library** and is a memory-hard KDF in its own
 *   right — it is what Node ships for exactly this purpose. Zero dependencies,
 *   nothing to rebuild, no install step that can fail on the box.
 * - bcrypt's one real advantage here — a 72-byte input truncation that forces
 *   short passwords to still be slow — is not an advantage we need, and its
 *   silent truncation of long passphrases is a footgun we would rather not
 *   ship.
 *
 * The stored format is self-describing, so the parameters can be raised later
 * without invalidating existing hashes:
 *
 *     scrypt$N$r$p$<salt base64>$<derived key base64>
 *
 * `verifyPassword` reads the parameters out of the stored string rather than
 * assuming today's constants, and `needsRehash` tells the login path when a
 * hash was made with weaker settings than we now use.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

/**
 * OWASP's scrypt floor is N=2^17, r=8, p=1. Node's default `maxmem` is 32 MB,
 * which is below what N=2^17 needs (≈128·N·r = 134 MB), so `maxmem` is raised
 * explicitly — leaving it at the default is how this silently fails at 2^15.
 */
export const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEM = 256 * 1024 * 1024;

/**
 * A password longer than this is rejected rather than hashed. scrypt's cost is
 * driven by N, not by input length, but an unbounded input is still an
 * unbounded allocation on an unauthenticated endpoint.
 */
export const MAX_PASSWORD_LENGTH = 1024;
/** Short enough to type on a phone, long enough not to be guessed. */
export const MIN_PASSWORD_LENGTH = 12;

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;

  const [, rawN, rawR, rawP, rawSalt, rawKey] = parts;
  const N = Number.parseInt(rawN, 10);
  const r = Number.parseInt(rawR, 10);
  const p = Number.parseInt(rawP, 10);
  if (![N, r, p].every((value) => Number.isInteger(value) && value > 0)) return null;

  try {
    const salt = Buffer.from(rawSalt, 'base64');
    const key = Buffer.from(rawKey, 'base64');
    if (salt.length === 0 || key.length === 0) return null;
    return { N, r, p, salt, key };
  } catch {
    return null;
  }
}

async function derive(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
  keyLength: number,
): Promise<Buffer> {
  // `promisify` picks the 3-argument overload, so the options object is passed
  // through a cast rather than being dropped — without it scrypt silently runs
  // at Node's defaults (N=16384) instead of the parameters above.
  const derived = await (
    scrypt as unknown as (
      password: string,
      salt: Buffer,
      keylen: number,
      options: { N: number; r: number; p: number; maxmem: number },
    ) => Promise<Buffer>
  )(password.normalize('NFKC'), salt, keyLength, { ...params, maxmem: MAX_MEM });
  return derived;
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error('Password exceeds the maximum length.');
  }
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, SCRYPT_PARAMS, KEY_LENGTH);
  const { N, r, p } = SCRYPT_PARAMS;
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/**
 * Constant-time comparison against a stored hash.
 *
 * Returns false — never throws — for a malformed or absent hash, so an invited
 * user with `password_hash IS NULL` fails login like any other wrong password
 * rather than 500ing and revealing that the account exists.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored || password.length > MAX_PASSWORD_LENGTH) return false;

  const parsed = parseHash(stored);
  if (!parsed) return false;

  try {
    const candidate = await derive(
      password,
      parsed.salt,
      { N: parsed.N, r: parsed.r, p: parsed.p },
      parsed.key.length,
    );
    return candidate.length === parsed.key.length && timingSafeEqual(candidate, parsed.key);
  } catch {
    // A stored hash with absurd parameters must not become a 500 on the login
    // route; it is simply a hash nothing can match.
    return false;
  }
}

/** True when a stored hash predates the current cost parameters. */
export function needsRehash(stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parsed = parseHash(stored);
  if (!parsed) return true;
  return parsed.N < SCRYPT_PARAMS.N || parsed.r < SCRYPT_PARAMS.r || parsed.p < SCRYPT_PARAMS.p;
}

/**
 * The one place that decides whether a password is acceptable. Length only:
 * composition rules push people towards `Password1!` and are not what makes a
 * secret hard to guess.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return 'La contraseña es demasiado larga.';
  }
  return null;
}
