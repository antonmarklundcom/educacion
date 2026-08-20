/**
 * The only way application code reports something to Sentry (PR-45).
 *
 * Server-side only — it is imported by `POST /api/client-error` and nothing
 * else. The SDK is imported **dynamically and behind the DSN check**, so a
 * process without `SENTRY_DSN` never loads it: on a Hostinger slot the app
 * process is also the thing serving pages, and 75 MB of SDK that will never
 * send anything is 75 MB taken from the pool.
 *
 * Nothing here throws. An observability tool that can break a request is worse
 * than one that is missing: the failure it would cause is on the path of the
 * error it was trying to report.
 *
 * ### Everything on this path is untrusted
 *
 * The report arrives from an unauthenticated endpoint. The independent review
 * demonstrated the consequence: an early version copied `name` and `stack`
 * verbatim onto a real `Error`, so anyone could manufacture a convincing
 * "DatabaseError: ECONNREFUSED on /carreras" in the operator's dashboard and
 * spend an afternoon chasing it. Three things follow, and all three are the
 * point of this module rather than decoration:
 *
 * - the exception **type is prefixed** `ClientReported:` and the event is
 *   tagged `unverified`, so no browser-supplied string can impersonate a
 *   server exception in a list of them;
 * - a **process-wide throttle** bounds how many of these reach Sentry at all.
 *   The endpoint's per-IP limit cannot: `x-forwarded-for` is written by the
 *   caller (`privacy/request.ts`), and `beforeSend`'s per-fingerprint throttle
 *   cannot either, because the fingerprint is derived from the same
 *   caller-supplied `name` and `stack`. This bucket is keyed on a constant,
 *   which is the only key an attacker cannot vary;
 * - anything that reaches a **log line** has its control characters removed,
 *   because the no-DSN path prints to the console `architecture.md` §29 opens
 *   by calling the current source of truth, and a newline there is a forged
 *   log line.
 */

import type { ClientErrorReport } from './client-report';
import { serverDsn } from './sentry-options';
import { EventThrottle } from './throttle';

/**
 * Browser reports forwarded per minute, process-wide.
 *
 * Generous enough that a real bug affecting many visitors is unmistakable —
 * twenty reports a minute is a loud alarm — and small enough that a script
 * cannot spend the shared free-tier quota. It resets when Hostinger recycles
 * the process, which is why `deployment.md` §8.1 also sets a per-key rate limit
 * inside the Sentry project: that is the half that survives a restart.
 */
export const CLIENT_REPORT_BUDGET = 20;
export const CLIENT_REPORT_WINDOW_MS = 60_000;

/** One bucket, one key, nothing the caller can vary. */
const forwardBudget = new EventThrottle(CLIENT_REPORT_BUDGET, CLIENT_REPORT_WINDOW_MS, 1);
const BUDGET_KEY = 'client-report';

async function sdk(): Promise<typeof import('@sentry/nextjs') | null> {
  if (!serverDsn()) return null;
  try {
    return await import('@sentry/nextjs');
  } catch (error) {
    console.error('[observability] the Sentry SDK failed to load', error);
    return null;
  }
}

/** Control characters — newlines included — out of anything bound for a log. */
export function logSafe(value: string): string {
  return value.replace(CONTROL_CHARACTERS, ' ');
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Report a browser error that reached one of the `error.tsx` boundaries.
 *
 * Returns whether it was forwarded, which the tests assert on; no caller reads
 * it, because there is nothing a browser could do with the answer.
 */
export async function captureClientError(
  report: ClientErrorReport,
  now: number = Date.now(),
): Promise<boolean> {
  const decision = forwardBudget.decide(BUDGET_KEY, now);
  if (!decision.send) return false;

  const Sentry = await sdk();
  if (!Sentry) {
    // No DSN: the console is the log, which is exactly the local and CI
    // behaviour PR-45 promises.
    console.error(`[client] ${logSafe(report.name)}: ${logSafe(report.message)}`);
    return false;
  }

  try {
    const error = new Error(report.message);
    // Prefixed, so a forged `DatabaseError` cannot sit in a list looking like
    // one of ours.
    error.name = `ClientReported:${report.name}`;
    // The browser's stack, not this function's. A stack rebuilt from the server
    // would point at this file on every client error ever reported.
    error.stack = report.stack ?? error.stack;

    // Tags, not `setTag`: `setTag` writes the *global* scope and would apply to
    // every later event in the process instead of to this one.
    Sentry.captureException(error, {
      tags: {
        origin: 'client',
        // Provenance is not trust: this says the payload arrived from an
        // unauthenticated endpoint and nothing corroborates it.
        unverified: 'true',
        ...(decision.announcing ? { forward_budget_reached: 'true' } : {}),
        ...(report.digest ? { digest: report.digest } : {}),
        // The route, path only — `scrub.ts` drops `request` entirely, and this
        // is the one piece of context worth carrying.
        ...(report.path ? { route: report.path } : {}),
      },
    });
    return true;
  } catch (error) {
    console.error('[observability] failed to report a client error', error);
    return false;
  }
}
