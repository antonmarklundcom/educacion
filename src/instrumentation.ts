/**
 * Server-side observability (PR-45).
 *
 * Next calls `register()` once per server process, before any request. This is
 * where the Node SDK starts — and where it does **not** start, when
 * `SENTRY_DSN` is unset: the import is dynamic, so a deploy without the
 * variable never loads the SDK at all rather than loading it and telling it to
 * stay quiet. That is what "absent DSN = fully inert" has to mean on a
 * shared-hosting slot where the process is also the thing serving pages.
 *
 * `onRequestError` is Next 15's hook for errors thrown while rendering a
 * server component or handling a Server Action — the two places a `try/catch`
 * in our code would not see. Without it, `/carreras` failing against MySQL is a
 * line in Hostinger's console retention and nothing else, which is the gap
 * PR-45 exists to close.
 */

import { serverDsn } from '@/lib/observability/sentry-options';

export async function register(): Promise<void> {
  if (!serverDsn()) return;
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
}

/**
 * Typed loosely on purpose: Next's `onRequestError` signature has changed
 * across 15.x point releases, and this hook is a forwarder — it has no
 * behaviour of its own to get wrong. The SDK is loaded lazily for the same
 * reason `register` does: no DSN, no SDK.
 */
export const onRequestError = async (...args: unknown[]): Promise<void> => {
  if (!serverDsn()) return;
  const Sentry = await import('@sentry/nextjs');
  await (Sentry.captureRequestError as (...a: unknown[]) => unknown)(...args);
};
