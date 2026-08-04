/**
 * The stopgap gate on `/admin/stats`, and nothing else.
 *
 * ### Why this exists rather than `requireRole()`
 *
 * PR-18 owns authentication and has not landed; `/admin` is still a
 * placeholder. PR-17's acceptance asks for an *internal* stats view, and
 * "internal" cannot mean "publicly readable because auth is a later PR".
 *
 * So: a single secret in the environment, compared in constant time, and the
 * route 404s without it. **It fails closed** — with `ADMIN_STATS_TOKEN` unset,
 * which is its state in CI and in every environment until someone sets it, the
 * page does not exist at all. That is the flag `agent-workflow.md` §6 asks for
 * around a feature whose real access control is not built yet.
 *
 * ### What it is not
 *
 * It is not a session, not a login, and not a role. It has no expiry, no
 * revocation and no audit trail, and a token in a URL is a token in a browser
 * history. **PR-18 deletes this file** and replaces the call with
 * `requireRole(session, ['admin'])`; nothing else should ever import it.
 */

import { timingSafeEqual } from 'node:crypto';

const MIN_TOKEN_LENGTH = 24;

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // `timingSafeEqual` throws on a length mismatch, which would itself leak the
  // length; hash-free equalisation is enough here because the lengths compared
  // are the configured secret's and the caller's.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * `false` whenever the secret is unset or too short to be one — a four-letter
 * `ADMIN_STATS_TOKEN` should not be treated as configuration.
 */
export function hasStatsAccess(provided: string | string[] | undefined): boolean {
  const expected = process.env.ADMIN_STATS_TOKEN;
  if (!expected || expected.length < MIN_TOKEN_LENGTH) return false;

  const value = Array.isArray(provided) ? provided[0] : provided;
  if (typeof value !== 'string' || value.length === 0) return false;

  return constantTimeEquals(value, expected);
}

export const STATS_TOKEN_PARAM = 'token';
