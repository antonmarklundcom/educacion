/**
 * What may leave this process in an error report (PR-45).
 *
 * Sentry's job is to tell us that `/carreras` threw at 03:12. It is a
 * third-party service on somebody else's infrastructure, and this site's whole
 * argument for existing is that it is careful with data it did not have to
 * collect (`risks.md` §R-06). So the rule is an **allowlist**, at both levels:
 * an event keeps the named top-level keys and nothing else, and its `request`
 * keeps the path and the method and nothing else.
 *
 * An allowlist rather than a denylist because a denylist has to be updated
 * every time the SDK gains a field, and the failure mode of forgetting is a
 * student's phone number sitting in a SaaS dashboard forever. The independent
 * review of PR-45 found the first version of this file calling itself an
 * allowlist while deleting five named things and spreading the rest — which let
 * `server_name` (the host name), `modules`, `threads` and `attachments`
 * through, and, worse, left the one field where PII most plausibly appears
 * untouched. See `EXCEPTION` below.
 *
 * ### What is kept, and why each one earns it
 *
 * `event_id`, `timestamp`, `platform`, `level`, `logger`, `environment`,
 * `release`, `dist`, `type`, `sdk` — the envelope. `exception` and `message` —
 * the error, redacted (below). `transaction` — the route name. `request` —
 * narrowed to path and method. `tags` — ours, and `sendDefaultPii: false`
 * keeps the SDK from adding a user to them. `contexts` — minus `user` and
 * `response`. `breadcrumbs` — minus every `data`. `debug_meta` and
 * `fingerprint`: **`debug_meta` carries the ids that map a frame to an
 * uploaded sourcemap**, so dropping it would quietly cost the readable stacks
 * this PR exists to get.
 *
 * Everything else goes, including `server_name` (`os.hostname()` on a shared
 * host, and *not* covered by `sendDefaultPii: false`), `modules`, `threads`,
 * `spans`, `attachments`, `measurements`, `extra` and `user`.
 *
 * ### The field the first version missed
 *
 * `exception.values[].value` and `event.message` are the error's own text, and
 * on this site that text routinely quotes data: a mysql2 duplicate-key error is
 * `Duplicate entry 'ana@example.com' for key 'leads.email'`. Keeping the
 * sentence while removing what it quotes is the only useful answer — an error
 * with its message deleted is not worth sending — so `redactSecrets` replaces
 * anything that looks like an address or a phone number and leaves the rest.
 * That half is a pattern denylist, and is called one here rather than folded
 * into the word "allowlist".
 *
 * Everything is pure and synchronous, so `scrub.test.ts` asserts on realistic
 * events rather than on a mock of the SDK.
 */

/**
 * The subset of Sentry's `Event` this module touches.
 *
 * Deliberately structural rather than imported from `@sentry/nextjs`: the
 * scrubber is the one piece of PR-45 that must be testable and reviewable
 * without the SDK in the graph, and an allowlist that names its own fields is
 * easier to check against this comment than one that inherits 200 optional
 * properties.
 */
export interface ScrubbableEvent {
  exception?: { values?: { value?: string; type?: string }[] };
  message?: string;
  request?: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string> | string;
    data?: unknown;
    query_string?: unknown;
    env?: Record<string, unknown>;
  };
  user?: unknown;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  /** `Primitive` in the SDK, not `string` — widened so its `Event` fits. */
  tags?: Record<string, unknown>;
  breadcrumbs?: ScrubbableBreadcrumb[];
}

export interface ScrubbableBreadcrumb {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * The top-level keys an event may keep. Anything not here is dropped whole.
 *
 * `scrub.test.ts` walks Sentry's own `Event` type and fails if a key outside
 * this list survives, so adding a field to the SDK cannot quietly widen what
 * leaves the process.
 */
export const ALLOWED_EVENT_KEYS = [
  'breadcrumbs',
  'contexts',
  'debug_meta',
  'dist',
  'environment',
  'event_id',
  'exception',
  'fingerprint',
  'level',
  'logger',
  'message',
  'platform',
  'release',
  'request',
  'sdk',
  'tags',
  'timestamp',
  'transaction',
  'type',
] as const;

/**
 * Things that look like a person, inside text we otherwise want to keep.
 *
 * Deliberately blunt. A false positive costs a `[filtrado]` in an error
 * message; a false negative is an address in a third-party dashboard, and the
 * asymmetry is the whole design. The phone pattern is not Paraguay-specific —
 * a run of eight or more digits is an id, a document number or a phone, and
 * none of the three belongs here.
 */
const SECRET_PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[correo]'],
  [/\+?\d[\d\s().-]{7,}\d/g, '[numero]'],
];

/** Redact what looks like PII, keep the sentence around it. */
export function redactSecrets(text: string | undefined): string | undefined {
  if (!text) return text;
  return SECRET_PATTERNS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  );
}

/** Replaces a URL's query and fragment. The path is the useful half. */
export function scrubUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : `${url.slice(0, cut)}?[filtrado]`;
}

/**
 * The only `request` fields an event keeps.
 *
 * `method` and the path answer "which route threw"; nothing else on `request`
 * is ours to send.
 */
function scrubRequest(request: NonNullable<ScrubbableEvent['request']>) {
  return {
    url: scrubUrl(request.url),
    method: request.method,
  };
}

/**
 * A breadcrumb keeps its category and message; its `data` is dropped whole.
 *
 * `data` is where the SDK puts a fetch's URL, an XHR's body size, a click
 * target's text — the last of which is whatever the person had typed.
 */
function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(breadcrumb: B): B {
  return {
    ...breadcrumb,
    message: scrubUrl(breadcrumb.message),
    data: undefined,
  };
}

/**
 * The `beforeSend` both runtimes use.
 *
 * Returns a new object; the input is never mutated, so a caller that keeps a
 * reference for logging does not find it emptied.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  // Generic over the caller's event type, and `ScrubbableEvent` deliberately
  // has *no* index signature: a TypeScript interface never gets an implicit
  // one, so an indexed version would refuse Sentry's own `ErrorEvent` and the
  // whole module would have to be reached through a cast.
  const source = event as Record<string, unknown>;
  const scrubbed: Record<string, unknown> = {};

  // The allowlist. Anything the SDK adds later — a new context, a new
  // attachment kind — is absent by default rather than present by default,
  // which is the only version of this rule that stays true without maintenance.
  for (const key of ALLOWED_EVENT_KEYS) {
    if (key in source) scrubbed[key] = source[key];
  }

  if (event.request) scrubbed.request = scrubRequest(event.request);
  if (event.message) scrubbed.message = redactSecrets(event.message);

  // The error's own text, which on this site routinely quotes a row: a mysql2
  // duplicate-key error names the value that collided.
  if (event.exception?.values) {
    scrubbed.exception = {
      ...event.exception,
      values: event.exception.values.map((value) => ({
        ...value,
        value: redactSecrets(value.value),
      })),
    };
  }

  if (event.contexts) {
    // `user` is an account we never identify to a third party; `response` can
    // carry a rendered body.
    const contexts = { ...event.contexts };
    delete contexts.user;
    delete contexts.response;
    scrubbed.contexts = contexts;
  }

  if (event.breadcrumbs) {
    scrubbed.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  }

  return scrubbed as T;
}
