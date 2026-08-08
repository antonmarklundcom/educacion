/**
 * The pure half of the moderation queue: what a proposal actually contains, and
 * which of its fields differ from what we have. Both drive the merge UI, and
 * both are decisions a database cannot help with, so they are tested here
 * without one.
 */

import { describe, expect, it } from 'vitest';

import { NON_COLUMN_KEYS, differingFields, proposedColumns } from './conflicts';

describe('proposedColumns', () => {
  it('drops the keys that are not columns of anything', () => {
    const columns = proposedColumns({
      nameOfficial: 'Universidad X',
      matchCandidates: [{ id: 1, score: 91 }],
      matchMethod: 'trigram',
      citable: false,
    });
    expect(columns).toEqual({ nameOfficial: 'Universidad X' });
    for (const key of NON_COLUMN_KEYS) expect(columns).not.toHaveProperty(key);
  });

  it('keeps an explicit null — the source saying "there is no value"', () => {
    expect(proposedColumns({ website: null })).toEqual({ website: null });
  });
});

describe('differingFields', () => {
  const current = { nameOfficial: 'Universidad X', level: 'grado', website: null };

  it('lists only what actually changed', () => {
    expect(differingFields(current, { nameOfficial: 'Universidad X', level: 'maestria' })).toEqual([
      'level',
    ]);
  });

  it('is empty when the source agrees with us — a conflict that went stale', () => {
    expect(differingFields(current, { nameOfficial: 'Universidad X' })).toEqual([]);
  });

  it('treats null as a difference when we have a value', () => {
    expect(differingFields({ website: 'https://x.py' }, { website: null })).toEqual(['website']);
  });

  it('ignores undefined — the source has nothing to say about that field', () => {
    expect(differingFields(current, { website: undefined })).toEqual([]);
  });

  it('for a create, every supplied field is a difference', () => {
    expect(differingFields(null, { nameOfficial: 'Nueva', slug: 'nueva' }).sort()).toEqual([
      'nameOfficial',
      'slug',
    ]);
  });

  it('never offers a non-column as something to merge', () => {
    expect(
      differingFields(current, { level: 'maestria', matchMethod: 'trigram', citable: true }),
    ).toEqual(['level']);
  });
});
