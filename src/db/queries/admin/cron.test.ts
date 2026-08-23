/**
 * Reading a cron history back out of `activity_log` (PR-50).
 *
 * The write is one `logActivity` call; the reading is where the decisions are.
 * `lastCronRuns` has to pick the newest row **per job** out of one descending
 * scan, and it has to survive rows whose payload is not what it expects —
 * `after_json` is a `json` column that anything could have written.
 */

import { describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';

import { lastCronRuns, logCronRun } from './cron';

function dbReturning(rows: unknown[]): Db {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (value: unknown) => void) => resolve(rows);
        return () => proxy;
      },
    },
  );
  return { select: () => proxy, insert: () => proxy } as unknown as Db;
}

function row(id: number, after: unknown, at: string, userId: number | null = null) {
  return { id, userId, afterJson: after, createdAt: new Date(at) };
}

describe('lastCronRuns', () => {
  it('keeps the newest row per job and drops the older ones', async () => {
    const runs = await lastCronRuns(
      dbReturning([
        row(3, { job: 'lead-digest', outcome: 'ok', sent: 4 }, '2026-08-23T08:00:00Z'),
        row(2, { job: 'lead-retry', outcome: 'failed', error: 'boom' }, '2026-08-23T07:00:00Z'),
        row(1, { job: 'lead-digest', outcome: 'failed' }, '2026-08-22T08:00:00Z'),
      ]),
    );

    expect(runs.get('lead-digest')?.outcome).toBe('ok');
    expect(runs.get('lead-digest')?.result).toEqual({ sent: 4 });
    expect(runs.get('lead-retry')?.outcome).toBe('failed');
    expect(runs.size).toBe(2);
  });

  it('separates a run hPanel fired from one somebody pressed', async () => {
    const runs = await lastCronRuns(
      dbReturning([row(9, { job: 'staleness', outcome: 'ok' }, '2026-08-23T08:00:00Z', 7)]),
    );
    expect(runs.get('staleness')?.userId).toBe(7);
  });

  it('ignores a row whose payload names no job rather than inventing one', async () => {
    const runs = await lastCronRuns(
      dbReturning([
        row(1, { outcome: 'ok' }, '2026-08-23T08:00:00Z'),
        row(2, null, '2026-08-23T07:00:00Z'),
      ]),
    );
    expect(runs.size).toBe(0);
  });

  it('reads an unrecognised outcome as failed, never as success', async () => {
    const runs = await lastCronRuns(
      dbReturning([row(1, { job: 'admissions', outcome: 'weird' }, '2026-08-23T08:00:00Z')]),
    );
    expect(runs.get('admissions')?.outcome).toBe('failed');
  });

  it('reports no result rather than an empty object when the job returned nothing', async () => {
    const runs = await lastCronRuns(
      dbReturning([row(1, { job: 'sitemap', outcome: 'not_needed' }, '2026-08-23T08:00:00Z')]),
    );
    expect(runs.get('sitemap')?.result).toBeNull();
  });
});

describe('logCronRun', () => {
  it('never lets its own failure become the job’s failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = {
      insert: () => {
        throw new Error('activity_log is gone');
      },
    } as unknown as Db;

    await expect(
      logCronRun('lead-digest', 'ok', { sent: 1 }, null, broken),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
