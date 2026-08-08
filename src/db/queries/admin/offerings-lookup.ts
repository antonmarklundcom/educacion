/**
 * One-row lookups the admin needs to scope a form, kept out of `offerings.ts`
 * because they are reads with no CRUD around them (CLAUDE.md rule 5).
 */

import { eq } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { offerings, programs } from '@/db/schema';

/** Which institution an offering belongs to — for scoping an offering `<select>`. */
export async function offeringInstitutionId(
  offeringId: number,
  database: Db = defaultDb,
): Promise<number | null> {
  const [row] = await database
    .select({ institutionId: programs.institutionId })
    .from(offerings)
    .innerJoin(programs, eq(programs.id, offerings.programId))
    .where(eq(offerings.id, offeringId))
    .limit(1);
  return row?.institutionId ?? null;
}
