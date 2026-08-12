/**
 * Plan seed — the price list from `docs/monetization.md` §3.
 *
 * Idempotent: rows are matched on `code` and updated in place, never
 * duplicated, never deleted. Run it as often as you like.
 *
 *   $env:DATABASE_URL = "mysql://user:pass@srvXXXX.hstgr.io:3306/dbname"
 *   npx tsx scripts/seed-plans.ts
 *
 * tsx does NOT load .env — see docs/deployment.md §5.
 *
 * ### Why this is a seed and not a migration
 *
 * Prices change without the schema changing. Keeping them in a re-runnable
 * seed means a price revision is an edit to this file plus one command, and
 * the file stays the readable answer to "what do we charge", next to the
 * document that justifies each number.
 *
 * ### What the rows mean
 *
 * - `price_usd_year` is the **quote**. We invoice in guaraníes at the day's
 *   rate and store that amount on the subscription (`monetization.md` §5), so
 *   this column is never used to compute what anybody actually owes.
 * - `program_band_min/max` price the same feature set by size. The bands must
 *   tile 0..∞ without a gap: `bandForProgramCount` returns null rather than
 *   guessing, and `seed-plans.test.ts` asserts the tiling.
 * - `rank` is the entitlement scale — 0 gratis, 1 verificado, 2 destacado —
 *   and the same value `program_search.plan_rank` carries.
 * - `features_json` is **descriptive only**. What a plan unlocks is
 *   `FEATURES_BY_RANK` in `src/lib/entitlements/contract.ts`, in code, where a
 *   typo cannot silently switch a paid feature off.
 * - `included_leads_month` is left NULL everywhere: pay-per-lead is a Phase 3+
 *   idea that needs 300+ leads/month to exist first (`monetization.md` §3),
 *   and a quota nobody has agreed to is a number we would be inventing.
 */

import { sql } from 'drizzle-orm';

import { createDb, createPool } from '../src/db';
import { plans } from '../src/db/schema';
import { PLAN_SEED } from '../src/lib/entitlements/catalog';

export async function seedPlans(database: ReturnType<typeof createDb>): Promise<void> {
  for (const plan of PLAN_SEED) {
    await database
      .insert(plans)
      .values({
        code: plan.code,
        name: plan.name,
        priceUsdYear: plan.priceUsdYear,
        programBandMin: plan.programBandMin,
        programBandMax: plan.programBandMax,
        rank: plan.rank,
        featuresJson: plan.featuresJson,
        includedLeadsMonth: null,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: sql`values(name)`,
          priceUsdYear: sql`values(price_usd_year)`,
          programBandMin: sql`values(program_band_min)`,
          programBandMax: sql`values(program_band_max)`,
          rank: sql`values(\`rank\`)`,
          featuresJson: sql`values(features_json)`,
        },
      });
  }
}

async function main() {
  const pool = createPool();
  const database = createDb(pool);
  try {
    await seedPlans(database);
    console.log(`Seeded ${PLAN_SEED.length} plans.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
