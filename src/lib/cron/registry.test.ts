/**
 * The registry is the only job list (PR-50).
 *
 * Two lists of cron jobs — one in the route's `switch`, one on the console —
 * is how `/admin/importaciones` ends up offering a job the route answers
 * `not_implemented` for. There is now one, and these tests hold it against the
 * two documents that describe it: the route file and `deployment.md` §7.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CRON_JOBS, cronJob, runnableCronJobs } from './registry';

const ROOT = resolve(__dirname, '../../..');

describe('the catalog', () => {
  it('has a unique name per job', () => {
    const names = CRON_JOBS.map((definition) => definition.job);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every job a label, a detail and a cadence an operator can read', () => {
    for (const definition of CRON_JOBS) {
      expect(definition.label.trim(), definition.job).not.toBe('');
      expect(definition.detail.trim(), definition.job).not.toBe('');
      expect(definition.cadence.trim(), definition.job).not.toBe('');
    }
  });

  it('states a reason for every job it cannot run, and only for those', () => {
    for (const definition of CRON_JOBS) {
      expect(definition.run === null, definition.job).toBe(definition.note != null);
    }
  });

  it('keeps sitemap listed and unrunnable — it is generated per request', () => {
    expect(cronJob('sitemap')?.run).toBeNull();
    expect(runnableCronJobs().map((definition) => definition.job)).not.toContain('sitemap');
  });

  it('marks purge-leads as the one job that deletes', () => {
    const destructive = CRON_JOBS.filter((definition) => definition.destructive).map((d) => d.job);
    expect(destructive).toEqual(['purge-leads']);
  });

  it('answers nothing for a job that does not exist', () => {
    expect(cronJob('rm-rf')).toBeUndefined();
  });
});

describe('the documents that describe the same jobs', () => {
  it('covers every route `deployment.md` §7 tells an operator to curl', () => {
    const deployment = readFileSync(resolve(ROOT, 'docs/deployment.md'), 'utf8');
    const curled = new Set(
      [...deployment.matchAll(/\/api\/cron\/([a-z-]+)/g)].map((match) => match[1]!),
    );
    expect(curled.size).toBeGreaterThan(5);
    for (const job of curled) {
      expect(cronJob(job), `${job} is documented but not in the registry`).toBeDefined();
    }
  });

  it('is what the route reads — the route holds no job list of its own', () => {
    const route = readFileSync(resolve(ROOT, 'src/app/api/cron/[job]/route.ts'), 'utf8');
    expect(route).toContain("from '@/lib/cron/registry'");
    // A `case 'lead-digest':` in the route would be a second list.
    expect(route).not.toMatch(/case\s+'[a-z-]+':/);
  });
});
