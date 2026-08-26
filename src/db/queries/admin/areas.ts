/**
 * Admin editing for `areas` (PR-30) — the editorial description and the sort
 * order, and nothing else. Rule 5.
 *
 * **Áreas are not created or deleted here.** They are the browse taxonomy the
 * career matcher maps onto (`scripts/seed-taxonomy.ts`), they are in indexed
 * URLs, and every career points at one; adding or removing one is a data
 * decision with a seed behind it, not a form. What an editor needs is the 150
 * words that get the hub out of `noindex` (`seo.md` §4.1), and that is what
 * this exposes.
 */

import { asc, eq } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { areas } from '@/db/schema';
import { expirePublicReads } from '@/lib/cache';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { AreaInput } from '@/lib/admin/validation';

import { logActivity } from './activity-log';

export type AreaRow = typeof areas.$inferSelect;

export async function listAreasAdmin(
  actor: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<AreaRow[]> {
  requireRole(actor, ['editor']);
  return database.select().from(areas).orderBy(asc(areas.sortOrder), asc(areas.nameEs));
}

export async function getAreaForEdit(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<AreaRow | null> {
  requireRole(actor, ['editor']);
  const [row] = await database.select().from(areas).where(eq(areas.id, id)).limit(1);
  return row ?? null;
}

export async function updateArea(
  actor: SessionUser | null | undefined,
  id: number,
  input: AreaInput,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(areas).where(eq(areas.id, id)).limit(1);
    if (!before) throw new Error('Área no encontrada.');

    const row = {
      nameEs: input.nameEs,
      descriptionMd: input.descriptionMd,
      sortOrder: input.sortOrder,
    };
    await tx.update(areas).set(row).where(eq(areas.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'area',
      entityId: id,
      action: 'update',
      before: { ...before },
      after: { ...before, ...row },
    });
  });

  // PR-55 put the área reads behind the public-read cache, and this is the one
  // write that reaches them: an área's name is not in `program_search`, so
  // there is no `rebuildProgramSearch()` here to hang the expiry on and the
  // 150 words an editor writes to lift a hub out of `noindex` would otherwise
  // wait up to an hour to appear. Same reasoning, and the same call, as
  // `claims.ts` (`cache/tags.ts`).
  //
  // Outside the transaction on purpose: expiring a cache for a write that then
  // rolls back would serve a cold read of unchanged data, which is merely slow;
  // expiring nothing after a write that committed is a stale page.
  expirePublicReads();
}
