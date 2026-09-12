/**
 * `setCareerDescriptionIfNull` must never overwrite copy an admin already
 * wrote (PR-63: "writes `careers.description_md` **only where it is null**").
 *
 * That guarantee lives entirely in the statement's `WHERE ... AND
 * description_md IS NULL` — it is not a read-then-write check, so a
 * concurrent admin edit still loses the race safely. Prose asserting it is
 * worth nothing without a test that fails when the condition is dropped
 * (`docs/agent-workflow.md` §5.1 item 4), and the seed cannot be exercised
 * against a real database from CI, so the statement is inspected instead:
 * the fake `Db` records the condition drizzle builds and this walks its
 * chunks.
 */

import { describe, expect, it } from 'vitest';

import { careers } from '@/db/schema';

import { setCareerDescriptionIfNull } from './careers';

/** Flattens a drizzle SQL condition into column names and operator text. */
function describeCondition(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node !== 'object') {
    if (typeof node === 'string') out.push(node.trim());
    return out;
  }
  const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) describeCondition(chunk, out);
    return out;
  }
  // drizzle wraps literal SQL text in a StringChunk whose `value` is string[].
  const value = (node as { value?: unknown }).value;
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    for (const part of value as string[]) {
      const trimmed = part.trim();
      if (trimmed) out.push(trimmed);
    }
    return out;
  }
  const name = (node as { name?: unknown }).name;
  if (typeof name === 'string') out.push(`column:${name}`);
  return out;
}

function fakeDb(affectedRows: number) {
  const calls: { values?: unknown; condition?: unknown } = {};
  const db = {
    update: (table: unknown) => {
      calls.values = undefined;
      expect(table).toBe(careers);
      return {
        set: (values: unknown) => {
          calls.values = values;
          return {
            where: (condition: unknown) => {
              calls.condition = condition;
              return Promise.resolve([{ affectedRows }]);
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

describe('setCareerDescriptionIfNull', () => {
  it('conditions the write on description_md still being NULL', async () => {
    const { db, calls } = fakeDb(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await setCareerDescriptionIfNull('medicina', 'copy', db as any);

    const parts = describeCondition(calls.condition);
    const text = parts.join(' ').toLowerCase();

    expect(parts).toContain('column:description_md');
    expect(text).toContain('is null');
    // Scoped to one career, not a table-wide update.
    expect(parts).toContain('column:slug');
  });

  it('writes only the description column', async () => {
    const { db, calls } = fakeDb(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await setCareerDescriptionIfNull('medicina', 'copy', db as any);
    expect(calls.values).toEqual({ descriptionMd: 'copy' });
  });

  it('reports true when a row was written', async () => {
    const { db } = fakeDb(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(setCareerDescriptionIfNull('medicina', 'copy', db as any)).resolves.toBe(true);
  });

  it('reports false when the row already had copy, so the seed stays idempotent', async () => {
    const { db } = fakeDb(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(setCareerDescriptionIfNull('medicina', 'copy', db as any)).resolves.toBe(false);
  });
});
