/**
 * The cache vocabulary — one tag, one TTL, and the reasons for both.
 *
 * ### Why exactly one tag
 *
 * The obvious design is fine-grained tags: `institution:una`, `career:derecho`,
 * one per entity, so a price edit only expires the pages that show that price.
 * It is also unsound here, and saying why is the point of this file.
 *
 * Every cached read on this site is a read of `program_search`, or of a table
 * that `program_search` denormalises. One row of the index carries the
 * institution's name and logo, the career, the city, the arancel, the
 * accreditation badge and the `plan_rank` derived from the institution's
 * subscription. A career hub's result page is rows from dozens of institutions;
 * a facet count is an aggregate over the whole table. So for almost any write,
 * "which cached entries could this have changed?" has the answer **any of
 * them** — and a tag scheme that claims otherwise is a claim the code cannot
 * keep. A wrong price surviving in a cache because its institution tag was not
 * on the entry is exactly the failure this project cannot afford (CLAUDE.md
 * rule 1 is about not showing numbers we cannot stand behind; a stale cache is
 * a slower way to do the same thing).
 *
 * One tag makes the invalidation rule cheap to state instead: **almost every
 * write that can change a public read goes through `rebuildProgramSearch()`**,
 * and that function expires this tag. The cost is a cold cache after any admin
 * edit, which on a catalog otherwise rebuilt once a night is the right trade.
 *
 * "Almost" is the honest word, and the exceptions are listed rather than waved
 * at — the first version of this comment said "every", and the independent
 * review found one that was not:
 *
 * - **Claim redemption** (`db/queries/claims.ts`) writes
 *   `institutions.claimed_by_user_id` and nothing else. That column is not in
 *   the search index, so there is no rebuild to hang the expiry on — but it
 *   *is* `InstitutionProfile.isClaimed`, which decides whether the public page
 *   keeps offering "¿Es tu institución?" to the person who has just claimed it.
 *   That path calls `expirePublicReads()` itself.
 * - **`npm run curate`** (`db/queries/curation.ts`) writes institutions,
 *   programs and offerings without rebuilding. It runs out of process, so there
 *   is no cache in reach and nothing to expire; the runbook's
 *   `npm run search:rebuild` afterwards is what publishes its work. If a later
 *   PR moves `curate` into the browser (pr-plan.md PR-50 proposes exactly
 *   that), it has to rebuild the index anyway, and the expiry comes with it.
 * - **`admin/areas.ts`** (PR-55) writes `areas`, whose name is not in the
 *   index either, and expires the tag itself for the same reason.
 * - **`admin/becas.ts`** and **`admin/posts.ts`** (PR-57) write `becas` and
 *   `posts`. Neither table is in `program_search`, so neither ever called
 *   `rebuildProgramSearch()` — but PR-57 put `@/lib/becas` and `@/lib/posts`
 *   behind this cache, and every mutation in both files now calls
 *   `expirePublicReads()` itself, outside its transaction, same shape as
 *   `admin/areas.ts`. Without it, a beca an editor just published would not
 *   appear on `/becas` for up to an hour.
 *
 * **`plans` is not an exception, because it is not a write path at all.**
 * `listPlans()` (`@/lib/plans`, PR-57) is cached the same way, but `plans` is
 * written once by `npm run seed:plans` — out of process, like `curate` above,
 * with no cache to expire and nothing that calls this file from inside a
 * request.
 *
 * ### Why the TTL is an hour
 *
 * The tag is the real invalidation mechanism; the TTL is the backstop for the
 * one thing tags cannot catch — a row that changed without a rebuild, e.g. the
 * date rolling over under a query whose `WHERE` compares against today. An hour
 * matches the `revalidate: 3600` that `architecture.md` §3 already names for the
 * SEO surfaces, so there is one number on this site, not two.
 */

/** Every cached public read carries this tag; `rebuildProgramSearch` expires it. */
export const PUBLIC_READ_TAG = 'public-read';

/** Seconds. See above — the backstop, not the mechanism. */
export const PUBLIC_READ_TTL_SECONDS = 3600;
