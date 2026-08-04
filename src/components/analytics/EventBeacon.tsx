'use client';

/**
 * CLIENT COMPONENT — reports one page-level event once, on mount.
 *
 * Justification: the event has to be reported by something that ran in a
 * browser. Counting the view server-side during render would count every
 * crawler, every uptime check and every prefetch as a student, and the number
 * PR-28 shows an institution has to survive being questioned.
 *
 * It renders nothing. Where JavaScript never runs the view is not counted —
 * an undercount is honest, an overcount is not.
 *
 * The `key` a route gives it (the offering or institution id) is what makes a
 * client-side navigation between two program pages report two views: React
 * remounts the component rather than reusing it.
 */

import { useEffect, useRef } from 'react';

import { sendEvent } from '@/lib/analytics/beacon';
import type { ClientEventType } from '@/lib/events/contract';

export interface EventBeaconProps {
  type: Extract<ClientEventType, 'offering_view' | 'profile_view'>;
  offeringId?: number;
  institutionId?: number;
}

export function EventBeacon({ type, offeringId, institutionId }: EventBeaconProps) {
  // Strict mode mounts twice in development; one view is one view.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    sendEvent(type, { offeringId, institutionId });
  }, [type, offeringId, institutionId]);

  return null;
}
