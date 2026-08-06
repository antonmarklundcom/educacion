import { describe, expect, it } from 'vitest';

import { CITY_GATE_MIN_INSTITUTIONS, CITY_GATE_MIN_OFFERINGS, passesCityGate } from './index';

describe('passesCityGate', () => {
  it('requires both the offering floor and the institution floor', () => {
    expect(passesCityGate({ offeringCount: CITY_GATE_MIN_OFFERINGS, institutionCount: CITY_GATE_MIN_INSTITUTIONS })).toBe(
      true,
    );
    expect(
      passesCityGate({ offeringCount: CITY_GATE_MIN_OFFERINGS - 1, institutionCount: CITY_GATE_MIN_INSTITUTIONS }),
    ).toBe(false);
    expect(
      passesCityGate({ offeringCount: CITY_GATE_MIN_OFFERINGS, institutionCount: CITY_GATE_MIN_INSTITUTIONS - 1 }),
    ).toBe(false);
  });

  it('rejects three offerings from a single institution', () => {
    expect(passesCityGate({ offeringCount: 3, institutionCount: 1 })).toBe(false);
  });
});
