/**
 * The browser's one way to report a first-party event.
 *
 * Every client-side call site — the WhatsApp button, the page-view beacon, the
 * comparador — goes through `sendEvent`, so the payload shape, the transport
 * and the "never let analytics break the page" rule exist once rather than
 * three times.
 *
 * ### Why `sendBeacon` first
 *
 * `whatsapp_click` fires as the browser is navigating away, and a `fetch` at
 * that moment is routinely cancelled. `navigator.sendBeacon` is queued by the
 * browser and survives the unload. Where it is unavailable the call falls back
 * to a keepalive `fetch`, and where that fails too the event is simply lost —
 * an uncounted real click is a smaller error than a page that broke trying to
 * count it.
 *
 * Client-safe: no database, no crypto, no server imports. The session hash is
 * computed server-side from the request and can never be supplied from here
 * (`architecture.md` §6.4).
 */

import { EVENTS_ENDPOINT, type ClientEventType } from '@/lib/events/contract';

export interface BeaconTarget {
  offeringId?: number | null;
  institutionId?: number | null;
}

/**
 * The wire body. Exported so it can be asserted in a test without a DOM: the
 * property that matters is that nothing identifying a person is in it.
 */
export function beaconPayload(type: ClientEventType, target: BeaconTarget = {}): string {
  const body: Record<string, unknown> = { type };
  if (target.offeringId != null) body.offeringId = target.offeringId;
  if (target.institutionId != null) body.institutionId = target.institutionId;
  return JSON.stringify(body);
}

export function sendEvent(type: ClientEventType, target: BeaconTarget = {}): void {
  if (typeof navigator === 'undefined') return;

  const body = beaconPayload(type, target);

  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(EVENTS_ENDPOINT, blob)) return;
    }
    void fetch(EVENTS_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics never stands between a student and what they were doing.
  }
}
