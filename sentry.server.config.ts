/**
 * The Node SDK (PR-45). Imported only from `src/instrumentation.ts`, and only
 * when `SENTRY_DSN` is set — see there for why the import is dynamic.
 *
 * Every option, including the PII scrubber and the crash-loop throttle, comes
 * from `sentryInitOptions` so the three runtimes cannot make different promises.
 */

import * as Sentry from '@sentry/nextjs';

import { sentryInitOptions, serverDsn } from '@/lib/observability/sentry-options';

const dsn = serverDsn();
if (dsn) {
  Sentry.init({
    ...sentryInitOptions(dsn),
    // The stack is the whole point; the local variables in it are not, and
    // `localVariables` would put a lead's form data into a frame.
    includeLocalVariables: false,
  });
}
