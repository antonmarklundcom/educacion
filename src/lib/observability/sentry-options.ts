/**
 * The `Sentry.init` options (PR-45).
 *
 * One builder rather than options written at the call site, because the PII
 * scrubber and the crash-loop throttle are the whole point and an `init` that
 * forgot one of them would look fine. `sentry.server.config.ts` says *where*
 * they are used and nothing else.
 *
 * ### Absent DSN = fully inert
 *
 * PR-45's acceptance criterion, and it is checked in three places rather than
 * one: `serverDsn()` returns `undefined` for an unset or blank variable, the
 * config file skips `init`, and `capture.ts` does not even `import` the SDK.
 * CI runs `npm run build` and `npm test` with no Sentry variables at all, and a
 * local `npm run dev` is the same — an error goes to the console and nowhere
 * else, which is where a developer wants it. `next.config.ts` applies the build
 * plugin under the same condition, so CI's build is byte-identical to the one
 * before this PR.
 *
 * There is no browser DSN, because the browser does not load the SDK: see
 * `client-report.ts` and `architecture.md` §29.
 */

import { scrubEvent, type ScrubbableBreadcrumb, type ScrubbableEvent } from './scrub';
import { EventThrottle, throttleKey, type ThrottleableEvent } from './throttle';

/** The server DSN. Never `NEXT_PUBLIC_` — the server has no reason to expose it. */
export function serverDsn(): string | undefined {
  return nonEmpty(process.env.SENTRY_DSN);
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Where an event says it came from. Defaults to the Node env, not to "production". */
export function environment(): string {
  return nonEmpty(process.env.SENTRY_ENVIRONMENT) ?? process.env.NODE_ENV ?? 'development';
}

export interface SentryInitOptions {
  dsn: string;
  environment: string;
  /**
   * Off. Tracing is a volume decision on a quota shared with the operator's
   * other sites, and PR-45 is about errors that currently vanish — not about
   * performance data nobody has asked for.
   */
  tracesSampleRate: 0;
  /** Off, explicitly: it is the default, and a default is not a decision. */
  sendDefaultPii: false;
  beforeSend: <T extends ScrubbableEvent & ThrottleableEvent>(event: T) => T | null;
  beforeBreadcrumb: <B extends ScrubbableBreadcrumb>(breadcrumb: B | null) => B | null;
}

/**
 * One throttle per process. Module-level on purpose: the point is to remember
 * across requests, which is what makes a crash loop visible as one.
 */
const processThrottle = new EventThrottle();

export interface InitDeps {
  /** Injectable so a test can watch a window close without waiting a minute. */
  now?: () => number;
  /** Injectable so tests do not share one process-wide bucket map. */
  throttle?: EventThrottle;
}

/** Build the options for a runtime. Nothing in the app passes `deps`. */
export function sentryInitOptions(dsn: string, deps: InitDeps = {}): SentryInitOptions {
  const now = deps.now ?? Date.now;
  const throttle = deps.throttle ?? processThrottle;

  return {
    dsn,
    environment: environment(),
    tracesSampleRate: 0,
    sendDefaultPii: false,

    beforeSend<T extends ScrubbableEvent & ThrottleableEvent>(event: T): T | null {
      const decision = throttle.decide(throttleKey(event), now());
      if (!decision.send) return null;

      const scrubbed = scrubEvent(event);
      if (decision.announcing) {
        // The last event of a loop carries the fact that it was a loop. Sending
        // nothing and saying nothing is how a limiter hides the outage it was
        // installed to reveal.
        scrubbed.tags = {
          ...scrubbed.tags,
          throttled: 'true',
          throttled_count: String(decision.count),
        };
      }
      return scrubbed;
    },

    /**
     * `data` is where the SDK puts a fetch's URL, an input's value and a click
     * target's text. None of it survives; the category and the message are what
     * make a breadcrumb trail readable.
     */
    beforeBreadcrumb<B extends ScrubbableBreadcrumb>(breadcrumb: B | null): B | null {
      if (!breadcrumb) return breadcrumb;
      return { ...breadcrumb, data: undefined };
    },
  };
}
