import { NextResponse } from 'next/server';

import { runRenewalReminders, runSubscriptionSweep } from '@/lib/billing/jobs';
import {
  runAdmissionsRefresh,
  runLeadPurge,
  runSearchRebuild,
  runStalenessDigest,
} from '@/lib/freshness/jobs';
import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { sendLeadDigests } from '@/lib/leads/digest';
import { retryLeadDelivery } from '@/lib/leads/retry';

export const dynamic = 'force-dynamic';

/**
 * hPanel cron hits this with `CRON_SECRET` in the `x-cron-secret` header
 * (`architecture.md` §10, `docs/deployment.md` §7). Jobs not yet built here
 * (search rebuild, staleness, admissions, sitemap) still answer
 * `not_implemented`. PR-23 added `lead-retry` and `lead-digest`, PR-29 the two
 * billing jobs, and PR-33 the rest of §10 — so the only route that still
 * answers with a status other than `ok` is `sitemap`, which answers
 * `not_needed` because the sitemap is generated per request.
 *
 * Every job is idempotent, and only one of them deletes: `purge-leads` enforces
 * the 24-month retention `/legal/privacidad` promises (`risks.md` §R-06).
 */
export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401 });
  }

  switch (job) {
    case 'lead-retry': {
      const result = await retryLeadDelivery();
      return NextResponse.json({ status: 'ok', job, ...result });
    }
    case 'lead-digest': {
      const result = await sendLeadDigests();
      return NextResponse.json({ status: 'ok', job, ...result });
    }
    case 'subscription-sweep': {
      const result = await runSubscriptionSweep();
      return NextResponse.json({ status: 'ok', job, ...result });
    }
    case 'renewal-reminders': {
      const result = await runRenewalReminders();
      return NextResponse.json({ status: 'ok', job, ...result });
    }
    case 'rebuild-search': {
      const result = await runSearchRebuild();
      return NextResponse.json({ status: 'ok', job, ...result });
    }
    case 'admissions': {
      const result = await runAdmissionsRefresh();
      return NextResponse.json({ status: 'ok', job, ...result });
    }
    case 'staleness': {
      const result = await runStalenessDigest();
      return NextResponse.json({ status: 'ok', job, ...result });
    }
    case 'purge-leads': {
      const result = await runLeadPurge();
      return NextResponse.json({ status: 'ok', job, ...result });
    }
    case 'sitemap':
      // Nothing to regenerate: `app/sitemap.ts` is generated per request from
      // the database (PR-30/31 added the editorial URLs). §10 listed this job
      // when a static file was the plan; answering honestly beats keeping a
      // no-op scheduled.
      return NextResponse.json({
        status: 'not_needed',
        job,
        detail: 'sitemap.xml is generated per request; no cron required.',
      });
    default:
      return NextResponse.json({ status: 'not_implemented', job });
  }
}
