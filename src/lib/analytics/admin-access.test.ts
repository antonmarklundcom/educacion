import { afterEach, describe, expect, it } from 'vitest';

import { hasStatsAccess } from './admin-access';

const TOKEN = 'a-long-enough-admin-stats-token';

afterEach(() => {
  delete process.env.ADMIN_STATS_TOKEN;
});

describe('hasStatsAccess', () => {
  it('fails closed when the secret is unset — the CI and default state', () => {
    expect(hasStatsAccess(TOKEN)).toBe(false);
    expect(hasStatsAccess(undefined)).toBe(false);
  });

  it('fails closed when the configured secret is too short to be one', () => {
    process.env.ADMIN_STATS_TOKEN = 'short';
    expect(hasStatsAccess('short')).toBe(false);
  });

  it('accepts only the exact token', () => {
    process.env.ADMIN_STATS_TOKEN = TOKEN;
    expect(hasStatsAccess(TOKEN)).toBe(true);
    expect(hasStatsAccess([TOKEN])).toBe(true);
    expect(hasStatsAccess(`${TOKEN}x`)).toBe(false);
    expect(hasStatsAccess(TOKEN.slice(0, -1))).toBe(false);
    expect(hasStatsAccess('')).toBe(false);
    expect(hasStatsAccess(undefined)).toBe(false);
  });
});
