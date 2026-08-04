import { describe, expect, it } from 'vitest';

import { beaconPayload } from './beacon';

describe('beaconPayload', () => {
  it('carries the type and the ids, and nothing else', () => {
    const body = JSON.parse(beaconPayload('whatsapp_click', { offeringId: 7, institutionId: 3 }));
    expect(body).toEqual({ type: 'whatsapp_click', offeringId: 7, institutionId: 3 });
  });

  it('omits ids it was not given rather than sending nulls', () => {
    expect(JSON.parse(beaconPayload('compare_add', { offeringId: 7 }))).toEqual({
      type: 'compare_add',
      offeringId: 7,
    });
    expect(JSON.parse(beaconPayload('profile_view'))).toEqual({ type: 'profile_view' });
  });

  it('never carries anything that could identify a person', () => {
    const body = JSON.parse(
      beaconPayload('offering_view', { offeringId: 1, institutionId: 2 }),
    ) as Record<string, unknown>;

    // The session hash is derived server-side from the request and can never be
    // supplied from the browser (architecture.md §6.4).
    for (const forbidden of ['sessionHash', 'session_hash', 'ip', 'email', 'phone', 'name']) {
      expect(forbidden in body).toBe(false);
    }
    expect(Object.keys(body).sort()).toEqual(['institutionId', 'offeringId', 'type']);
  });
});
