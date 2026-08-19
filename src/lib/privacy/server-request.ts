/**
 * The server-action half of `request.ts`.
 *
 * Split out so `request.ts` stays free of `next/headers`. It is imported by
 * `lib/leads` and `lib/events`, and dragging a server-only module into their
 * import graph turns two previously neutral modules server-only — where the
 * failure the day somebody imports `clientIp` from a client component is a
 * build error a long way from its cause (PR-42).
 */

import { headers } from 'next/headers';

import { hashClientIp } from './request';

/** `hashClientIp` for a server action, which must await the header list. */
export async function clientIpHash(): Promise<string> {
  return hashClientIp(await headers());
}
