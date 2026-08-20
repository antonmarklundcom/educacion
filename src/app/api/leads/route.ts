/**
 * `POST /api/leads` — the only way a lead enters the system.
 *
 * The handler is thin on purpose: origin check, rate limits, validation,
 * consent, offering resolution and persistence all live in `@/lib/leads`, where
 * they can be reasoned about in one place and tested without HTTP
 * (`architecture.md` §6).
 *
 * **The response never explains more than it must.** A rejected submission gets
 * a machine code from a fixed list and nothing about which check failed
 * internally; the honeypot gets the same `{ ok: true }` a real lead gets. There
 * is no `GET`: leads are not readable through the public API at all, and
 * PR-23's inbox reads them through an authenticated panel route instead.
 */

import { NextResponse } from 'next/server';

import { submitLead } from '@/lib/leads';
import type { LeadResponse } from '@/lib/leads/contract';
import { redactSecrets } from '@/lib/observability/scrub';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse<LeadResponse>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }

  let result;
  try {
    result = await submitLead(request, payload);
  } catch (error) {
    // Redacted: this is the one path where a mysql2 error quotes the
    // student's own row — `Duplicate entry 'ana@example.com' for key
    // 'leads.email'` is the literal example `observability/scrub.ts` cites.
    // Hostinger's console is a durable place for an address to sit.
    console.error(
      '[leads] submission failed',
      // The stack, not just the message: without it the console says a lead
      // failed and nothing about where, and `redactSecrets` scrubs a stack the
      // same way it scrubs a message.
      redactSecrets(error instanceof Error ? (error.stack ?? error.message) : String(error)),
    );
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }

  if (result.ok) return NextResponse.json({ ok: true }, { status: 201 });

  const status =
    result.error === 'rate_limited' ? 429 : result.error === 'invalid_origin' ? 403 : 400;

  return NextResponse.json(
    { ok: false, error: result.error },
    {
      status,
      headers: result.retryAfterSeconds
        ? { 'retry-after': String(result.retryAfterSeconds) }
        : undefined,
    },
  );
}
