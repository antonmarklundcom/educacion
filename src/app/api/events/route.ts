/**
 * `POST /api/events` — the browser's half of the first-party event log.
 *
 * PR-14 needs exactly one caller of this (`whatsapp_click`, from the WhatsApp
 * button), but the endpoint validates against the whole client-reportable set
 * because the alternative — an endpoint that accepts one string today and grows
 * a branch per event type — is a worse seam for PR-17 to build the remaining
 * call sites on.
 *
 * **What it refuses.** `lead_submit` is not in `CLIENT_EVENT_TYPES`: it is
 * written server-side by the lead route, because it is the number an
 * institution is invoiced against and a browser must not be able to claim one.
 * Everything else carries no identity beyond a salted, daily-rotating session
 * hash the server computes itself — the body cannot supply one.
 *
 * The response is always 202 with an empty body. An analytics beacon has
 * nothing useful to tell the page, and a client that cannot distinguish a
 * recorded event from a dropped one cannot be used to probe the log.
 */

import { NextResponse } from 'next/server';

import { recordEvent } from '@/lib/events';
import { isClientEventType } from '@/lib/events/contract';
import { checkRate, type RateLimitRule } from '@/lib/leads/rate-limit';
import { clientIp, isSameOrigin } from '@/lib/privacy/request';
import { hashIp } from '@/lib/privacy/hash';

export const dynamic = 'force-dynamic';

/** Generous — a browsing session legitimately fires many views. */
const EVENT_RULES: RateLimitRule[] = [
  { limit: 60, windowMs: 60_000 },
  { limit: 600, windowMs: 3_600_000 },
];

const accepted = () => new NextResponse(null, { status: 202 });

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return accepted();

  if (!checkRate(`event:${hashIp(clientIp(request))}`, Date.now(), EVENT_RULES).allowed) {
    return accepted();
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (!isClientEventType(body.type)) return accepted();

    const offeringId = Number(body.offeringId);
    const institutionId = Number(body.institutionId);

    await recordEvent({
      type: body.type,
      offeringId: Number.isInteger(offeringId) && offeringId > 0 ? offeringId : null,
      institutionId: Number.isInteger(institutionId) && institutionId > 0 ? institutionId : null,
      request,
    });
  } catch {
    // A malformed beacon is not an error worth reporting to the page.
  }

  return accepted();
}
