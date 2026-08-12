/**
 * The panel's own view of what its institution has bought (PR-25).
 *
 * There is no SQL here — `getEntitlements` owns that — but the *scoping* is
 * the point: `panelInstitutionId(user)` is the only id that reaches the read,
 * exactly as every other panel query does it (`architecture.md` §15). Putting
 * this in `db/queries/panel/` rather than calling `getEntitlements` from the
 * page keeps the rule uniform: a panel screen never chooses which institution
 * it is asking about.
 */

import type { Db } from '@/db';
import { getEntitlements, type Entitlements } from '@/lib/entitlements';
import type { SessionUser } from '@/lib/auth/session';

import { panelInstitutionId } from './scope';

export async function panelEntitlements(
  user: SessionUser | null | undefined,
  database?: Db,
): Promise<Entitlements> {
  return getEntitlements(panelInstitutionId(user), undefined, database);
}
