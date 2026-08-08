import { describe, expect, it } from 'vitest';

import { buildActivityLogRow } from './activity-log';

describe('buildActivityLogRow', () => {
  it('a create has a null before and a populated after', () => {
    const row = buildActivityLogRow({
      userId: 1,
      entityType: 'institution',
      entityId: 42,
      action: 'create',
      before: null,
      after: { nameShort: 'UNA' },
    });
    expect(row.beforeJson).toBeNull();
    expect(row.afterJson).toEqual({ nameShort: 'UNA' });
    expect(row.action).toBe('create');
  });

  it('a delete has a populated before and a null after', () => {
    const row = buildActivityLogRow({
      userId: 1,
      entityType: 'program',
      entityId: 7,
      action: 'delete',
      before: { status: 'draft' },
      after: null,
    });
    expect(row.beforeJson).toEqual({ status: 'draft' });
    expect(row.afterJson).toBeNull();
  });

  it('an update carries both snapshots and they differ', () => {
    const before = { status: 'draft' };
    const after = { status: 'published' };
    const row = buildActivityLogRow({
      userId: 3,
      entityType: 'offering',
      entityId: 9,
      action: 'update',
      before,
      after,
    });
    expect(row.beforeJson).toEqual(before);
    expect(row.afterJson).toEqual(after);
    expect(row.beforeJson).not.toEqual(row.afterJson);
  });

  it('never carries a userId-less entry — the caller must attribute every write', () => {
    const row = buildActivityLogRow({
      userId: 5,
      entityType: 'campus',
      entityId: null,
      action: 'create',
      before: null,
      after: { name: 'Sede Central' },
    });
    expect(row.userId).toBe(5);
  });
});
