/**
 * The institution directory's public surface — the same shape as
 * `src/lib/search/index.ts`: components import from here and receive plain
 * typed objects, never a Drizzle row (CLAUDE.md rule 5).
 *
 * Note what is *not* here: nothing that reads a program, a price or an
 * accreditation. Those still come from `searchPrograms()`, which is the only
 * place the 12-month arancel rule and the accreditation precedence rule are
 * applied. This module knows about institutions and counts, and nothing else.
 *
 * ### What PR-43 cached, and what it left alone
 *
 * `listInstitutions()` and `getInstitutionBySlug()` read through the public
 * cache: both are per-page reads that fan out into a `GROUP BY` over the whole
 * index. Every admin and panel write to `institutions` expires the tag, because
 * they all call `rebuildProgramSearch()`. The one write that does not is claim
 * redemption, which touches `claimed_by_user_id` — the column behind
 * `isClaimed` on this very profile — and it expires the tag itself; the list of
 * exceptions lives in `src/lib/cache/tags.ts` rather than being repeated here.
 *
 * `getWhatsappNumbers()` is deliberately **not** cached. It is the number under
 * a WhatsApp CTA, and §6.2 already refused to tie that field's correctness to a
 * refresh clock — an hour is a shorter wrong answer than a night, but it is the
 * same kind of wrong answer, and the query is one indexed `IN (…)` over ~59
 * rows. The cost of reading it live is not worth arguing about. (It returns a
 * `Map`, which `JSON.stringify` would flatten to `{}` — but that is not why it
 * is excluded, and `JsonPlain` would have refused the type either way.)
 */

import {
  getInstitutionBySlug as getInstitutionBySlugQuery,
  listInstitutions as listInstitutionsQuery,
  type InstitutionProfile,
  type InstitutionSummary,
} from '@/db/queries/institutions';
import { cachedRead, passthrough } from '@/lib/cache';

export {
  getWhatsappNumbers,
  type InstitutionCounts,
  type InstitutionProfile,
  type InstitutionSummary,
} from '@/db/queries/institutions';

/** Every published institution, alphabetically. Cached (PR-43). */
export function listInstitutions(): Promise<InstitutionSummary[]> {
  return cachedRead<InstitutionSummary[], InstitutionSummary[]>({
    name: 'institutions-list',
    key: 'all',
    load: () => listInstitutionsQuery(),
    decode: passthrough,
  });
}

/** One institution's full profile, or `null` — a 404 on the route. Cached (PR-43). */
export function getInstitutionBySlug(slug: string): Promise<InstitutionProfile | null> {
  return cachedRead<InstitutionProfile | null, InstitutionProfile | null>({
    name: 'institution-by-slug',
    key: slug,
    load: () => getInstitutionBySlugQuery(slug),
    decode: passthrough,
  });
}
