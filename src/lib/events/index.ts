/**
 * The event log's server surface.
 *
 * `recordEvent()` is the only way anything writes to `events`. It computes the
 * session hash itself from the request, so no caller ever has to think about
 * how a session is identified and no caller can pass one in — which is what
 * keeps "the hash is not reversible" a property of one function rather than a
 * convention across many call sites.
 *
 * **Recording an event never fails a request.** A dropped analytics row is an
 * inconvenience; a lead lost because the analytics insert threw is a real
 * student who did not reach an institution. Every write is wrapped and logged.
 *
 * PR-17 adds the remaining event types' call sites, the consent-banner
 * interaction and `/admin/stats`; PR-28 aggregates. Neither needs this
 * signature to change.
 */

import { insertEvent } from '@/db/queries/events';
import { clientIp, userAgent } from '@/lib/privacy/request';
import { hashSession } from '@/lib/privacy/hash';

import type { EventType } from './contract';

export type { EventType, ClientEventType, EventRequest } from './contract';
export { CLIENT_EVENT_TYPES, EVENTS_ENDPOINT, isClientEventType } from './contract';

export interface RecordEventInput {
  type: EventType;
  offeringId?: number | null;
  institutionId?: number | null;
  /** The incoming request; used only to derive the session hash. */
  request: Request;
}

export async function recordEvent({
  type,
  offeringId,
  institutionId,
  request,
}: RecordEventInput): Promise<void> {
  try {
    await insertEvent({
      type,
      offeringId: offeringId ?? null,
      institutionId: institutionId ?? null,
      sessionHash: hashSession(clientIp(request), userAgent(request)),
    });
  } catch (error) {
    console.error('[events] failed to record', type, error);
  }
}
