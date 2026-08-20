/**
 * `POST /api/client-error` — the browser's half of PR-45.
 *
 * A public, unauthenticated endpoint that forwards to a paid third-party
 * service on a quota shared with the operator's other sites. The independent
 * review's first finding was that an early version treated "rate limited per
 * hashed IP" as *the* control, and it is not one: `hashClientIp` reads
 * `x-forwarded-for`, which the caller writes. Rotating that header gives a
 * fresh bucket every request. So the bounds here are, in order:
 *
 * 1. **Same origin.** The same check the lead endpoint uses. A missing `Origin`
 *    on a POST means the caller is not a browser on this site. Forgeable by a
 *    script, which is why it is first and not last.
 * 2. **Per hashed IP**, 5/min. Stops an ordinary crash loop in one browser,
 *    which is the common case and the one this endpoint exists for.
 * 3. **A process-wide cap**, in `capture.ts`, keyed on nothing the caller
 *    controls. This is the one that actually bounds the quota: whatever
 *    arrives, the process forwards at most a fixed number of browser reports a
 *    minute. Beyond it, reports are counted and dropped.
 *
 * `src/lib/observability/client-report.ts` explains why this exists rather than
 * `@sentry/browser`: the SDK measures ~144 kB gzipped here, against a 150 kB
 * page budget.
 *
 * It always answers `204`. A reporter that tells a caller whether its report
 * was accepted is a reporter somebody can probe, and there is nothing a browser
 * could usefully do with the answer.
 */

import { NextResponse } from 'next/server';

import { captureClientError } from '@/lib/observability/capture';
import { MAX_BODY_BYTES, parseClientReport } from '@/lib/observability/client-report';
import { checkRate } from '@/lib/leads/rate-limit';
import { hashClientIp, isSameOrigin } from '@/lib/privacy/request';

export const dynamic = 'force-dynamic';

/**
 * Tighter than the lead form's: a browser filing six reports a minute is a
 * loop, and the sixth says nothing the first five did not.
 */
const REPORT_RULES = [
  { limit: 5, windowMs: 60_000 },
  { limit: 40, windowMs: 3_600_000 },
];

/** A fresh response per call: Next mutates the one it is given, per request. */
function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return noContent();

  const key = `client-error:${hashClientIp(request.headers)}`;
  if (!checkRate(key, Date.now(), REPORT_RULES).allowed) return noContent();

  // `content-length` is the caller's claim and can lie, so it is a cheap first
  // gate rather than the bound: an honest client with a huge body is refused
  // without reading it, and a lying one is caught by the byte check below.
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return noContent();

  let body: unknown;
  try {
    const text = await request.text();
    // Bytes, not `String.length`: `length` counts UTF-16 units, so an 8 000
    // character body of emoji is 32 kB and would have passed a naive check.
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return noContent();
    body = JSON.parse(text);
  } catch {
    return noContent();
  }

  const report = parseClientReport(body);
  if (!report) return noContent();

  await captureClientError(report);
  return noContent();
}
