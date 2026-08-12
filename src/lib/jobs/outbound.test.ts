import { describe, expect, it } from 'vitest';

import { JOBS_PARTNER_HOST, partnerSearchUrl } from './outbound';

describe('partnerSearchUrl', () => {
  it('carries the career into the partner search rather than dropping it', () => {
    expect(partnerSearchUrl('Ingeniería Informática')).toBe(
      `${JOBS_PARTNER_HOST}/empleos?q=Ingenier%C3%ADa%20Inform%C3%A1tica`,
    );
  });

  it('has no affiliate or tracking parameter', () => {
    const url = new URL(partnerSearchUrl('Medicina'));
    expect([...url.searchParams.keys()]).toEqual(['q']);
  });
});
