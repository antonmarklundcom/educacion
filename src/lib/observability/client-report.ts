/**
 * A browser error, on its way to the server (PR-45).
 *
 * ### Why this exists instead of the browser SDK
 *
 * PR-45's brief asks for client capture, and the obvious way is
 * `@sentry/browser`. Measured in this project it is **≈144 kB gzipped** — the
 * whole public page budget is 150 kB (`architecture.md` §9) — because Turbopack
 * does not tree-shake the package's index, so Replay, Feedback and
 * BrowserTracing come along whether or not they are configured. An error
 * reporter larger than the application it reports on is not a trade this site
 * makes; the person it would cost is a student on 4G in October, which is the
 * exact reader the budget was written for.
 *
 * So the browser sends a small, fixed, hand-built report to our own server, and
 * the **server** hands it to the Node SDK — which costs the browser nothing.
 * The cost of that choice is stated in §29: no automatic `window.onerror`, no
 * breadcrumbs, no unhandled-rejection capture. What it buys, besides the
 * kilobytes, is that the payload is an allowlist of five strings rather than
 * whatever the SDK decided to collect: there is no path by which a lead's form
 * data can reach Sentry from the browser, because there is no field for it.
 *
 * Everything here is pure and runs on both sides, so `client-report.test.ts`
 * can assert the contract without a browser or a network.
 */

/** The report, exactly. Any other key is dropped by `parseClientReport`. */
export interface ClientErrorReport {
  /** `error.name` — `TypeError`, `Error`. */
  name: string;
  /** `error.message`. Truncated; never a place to put a value. */
  message: string;
  /** `error.stack`, truncated. Absent when the browser did not provide one. */
  stack?: string;
  /** Next's opaque `digest`, which the server log also carries. */
  digest?: string;
  /** The route the boundary rendered on — **path only**, never the query. */
  path?: string;
}

export const MAX_MESSAGE_LENGTH = 500;
export const MAX_STACK_LENGTH = 4_000;
export const MAX_NAME_LENGTH = 120;
export const MAX_DIGEST_LENGTH = 64;
export const MAX_PATH_LENGTH = 256;

/** The whole accepted body, as a byte cap the route can enforce before parsing. */
export const MAX_BODY_BYTES = 8_192;

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/**
 * Whatever arrived → a report, or `null`.
 *
 * An allowlist: five keys, each a string, each truncated. A body with extra
 * keys is not rejected — it is *narrowed*, because rejecting would turn this
 * endpoint into an oracle for what it accepts, and a browser extension
 * decorating an error object should not silence the report.
 */
export function parseClientReport(body: unknown): ClientErrorReport | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as Record<string, unknown>;

  const name = text(raw.name, MAX_NAME_LENGTH) ?? 'Error';
  const message = text(raw.message, MAX_MESSAGE_LENGTH);
  const digest = text(raw.digest, MAX_DIGEST_LENGTH);

  // A report with neither a message nor a digest says nothing that the server
  // does not already know from its own log, and is what a bot POSTing `{}`
  // sends.
  if (!message && !digest) return null;

  return {
    name,
    message: message ?? '(sin mensaje)',
    stack: text(raw.stack, MAX_STACK_LENGTH),
    digest,
    path: safePath(raw.path),
  };
}

/**
 * The path, without the query or the fragment.
 *
 * `/carreras?q=…` is a person's search and `scrub.ts` drops it server-side
 * anyway; dropping it *before it leaves the browser* means it is never in a
 * request body either. Anything that is not a same-origin absolute path is
 * discarded rather than sanitised.
 */
export function safePath(value: unknown): string | undefined {
  const raw = text(value, MAX_PATH_LENGTH + 200);
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return undefined;
  const cut = raw.search(/[?#]/);
  return (cut === -1 ? raw : raw.slice(0, cut)).slice(0, MAX_PATH_LENGTH);
}

/** Where the browser posts. One constant so the two ends cannot drift. */
export const CLIENT_ERROR_ENDPOINT = '/api/client-error';

/**
 * Build the body from a caught error. Called in the browser.
 *
 * Deliberately reads only these fields off the error: a custom `Error`
 * subclass carrying a payload — which this codebase's `AuthError` and
 * `RaceLost` both are — must not have that payload serialized.
 */
export function toClientReport(
  error: Error & { digest?: string },
  path: string | undefined,
): ClientErrorReport {
  return {
    name: error.name || 'Error',
    message: (error.message || '(sin mensaje)').slice(0, MAX_MESSAGE_LENGTH),
    stack: error.stack?.slice(0, MAX_STACK_LENGTH),
    digest: error.digest?.slice(0, MAX_DIGEST_LENGTH),
    path: safePath(path),
  };
}
