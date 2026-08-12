import { NextResponse } from 'next/server';

import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { sendLeadDigests } from '@/lib/leads/digest';
import { retryLeadDelivery } from '@/lib/leads/retry';

export const dynamic = 'force-dynamic';

/**
 * hPanel cron hits this with `CRON_SECRET` in the `x-cron-secret` header
 * (`architecture.md` §10, `docs/deployment.md` §7). Jobs not yet built here
 * (search rebuild, staleness, admissions, sitemap) still answer
 * `not_implemented` — this PR only owns `lead-retry` and `lead-digest`.
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
    default:
      return NextResponse.json({ status: 'not_implemented', job });
  }
}
