/**
 * The event log's shared vocabulary — types and constants only.
 *
 * **Client-safe.** The WhatsApp button is a client component and this is the
 * only events module it may import; `@/lib/events` reaches the database and
 * must never appear in a `'use client'` file (`architecture.md` §5.1).
 */

import type { EVENT_TYPE } from '@/db/schema';

export type EventType = (typeof EVENT_TYPE)[number];

/**
 * The subset a browser is allowed to report.
 *
 * `lead_submit` is deliberately absent: it is written server-side inside the
 * lead route, from the same transaction path that created the row. Letting a
 * client claim a `lead_submit` would let anyone inflate the one number an
 * institution is invoiced against.
 */
export const CLIENT_EVENT_TYPES = [
  'offering_view',
  'whatsapp_click',
  'compare_add',
  'profile_view',
] as const satisfies readonly EventType[];

export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

export function isClientEventType(value: unknown): value is ClientEventType {
  return typeof value === 'string' && (CLIENT_EVENT_TYPES as readonly string[]).includes(value);
}

/** What the browser POSTs to `/api/events`. No identifiers, no free text. */
export interface EventRequest {
  type: ClientEventType;
  offeringId?: number;
  institutionId?: number;
}

export const EVENTS_ENDPOINT = '/api/events';
