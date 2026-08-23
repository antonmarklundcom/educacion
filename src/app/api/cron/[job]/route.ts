import { NextResponse } from 'next/server';

import { logCronRun } from '@/db/queries/admin/cron';
import { cronJob } from '@/lib/cron/registry';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';

export const dynamic = 'force-dynamic';

/**
 * hPanel cron hits this with `CRON_SECRET` in the `x-cron-secret` header
 * (`architecture.md` §10, `docs/deployment.md` §7).
 *
 * The job list lives in `@/lib/cron/registry` since PR-50, not in a `switch`
 * here: `/admin/importaciones` renders the same table, and a second list beside
 * this one is how the console ends up offering a job the route does not have.
 * `sitemap` is in the registry with no `run` and still answers `not_needed`,
 * because the sitemap is generated per request (PR-40).
 *
 * Every run is written to `activity_log` (`db/queries/admin/cron.ts`) — failures
 * included, which is the half that matters: a job that has been throwing for
 * three days looks exactly like a job hPanel never scheduled until the failure
 * is on the record.
 *
 * Every job is idempotent, and only one of them deletes: `purge-leads` enforces
 * the 24-month retention `/legal/privacidad` promises (`risks.md` §R-06).
 */
export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401 });
  }

  const definition = cronJob(job);
  if (!definition) {
    return NextResponse.json({ status: 'not_implemented', job });
  }

  // `x-cron-actor` is set by `/admin/importaciones`' own "ejecutar ahora"
  // action, which calls this route server-side with the same secret. It only
  // ever labels the log row; nothing is authorized by it, and a forged value
  // would need the secret to be sent at all.
  const actor = Number(request.headers.get('x-cron-actor'));
  const userId = Number.isInteger(actor) && actor > 0 ? actor : null;

  if (definition.run === null) {
    await logCronRun(job, 'not_needed', null, userId);
    return NextResponse.json({ status: 'not_needed', job, detail: definition.note });
  }

  try {
    const result = await definition.run();
    await logCronRun(job, 'ok', result, userId);
    return NextResponse.json({ status: 'ok', job, ...result });
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    await logCronRun(job, 'failed', { error: message }, userId);
    return NextResponse.json({ status: 'failed', job, error: message }, { status: 500 });
  }
}
