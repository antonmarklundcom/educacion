# PR A and PR F — the seam, the migration, the cutover

## PR A — the data seam (skip only if it already exists)

You cannot swap a backend the pages talk to directly. One module is the single data-access surface;
every page and API route imports from it, and nothing else calls the CMS or `fetch` at all.

negocio already has this and it is the reason this project is tractable:

```
lib/listings-repo.ts          the single surface — pages import ONLY from here
lib/providers/types.ts        ListingsProvider — the contract every backend implements
lib/providers/seed.ts         static data, always present
lib/providers/jetengine.ts    WordPress
lib/providers/db.ts           ← what you add
lib/types.ts                  Listing, Category, City, ListingQuery, ListingResult
```

Swapping the backend is a new provider plus **one line** in `selectPrimary()`. Keep the
`withFallback` wrapper during the transition — it logs and degrades to seed rather than 500ing —
and delete it in the same PR that deletes the CMS provider.

If the app you are converting does *not* have this seam, build it first, in its own PR, with the
existing backend still in place and the pages unchanged apart from their import. A seam PR that also
changes behaviour is unreviewable.

## PR F — migration

### 1. Freeze and snapshot

Stop editing in the CMS. Pull the full payload to disk **once** and commit nothing but a checksum:

```
GET /wp-json/wp/v2/<cpt>?per_page=100&page=N&_embed=1     (Basic auth, app password, server-side only)
```

Write the raw JSON to a scratch file. Every later step reads that file, not the network — the
importer must be re-runnable without the CMS being up, and the CMS is going away.

### 2. Field map, verified against the real payload

The mapping document (negocio: `FIELD-MAP.md`) is written from *guesses* until someone checks it.
Every meta key it lists is unverified until you have seen the live response. Verify each one before
importing; a wrong key imports as `undefined` silently, which is exactly the failure that surfaces
three weeks later as an empty field on 200 pages.

Reshape repeaters (hours especially) in one function with its own unit test over a real captured
payload. This is where the hours parser belongs, and it is where most of the migration bugs live.

### 3. Schema from the app's types, not from the CMS's

Derive the tables from the app's own domain types, not from the CMS's meta-key soup. Anything the
CMS stored as free text that the app treats as an enum becomes an enum, and rows that do not map get
listed for a human — **not** coerced to a default. A migration that silently invents values is worse
than one that fails.

Ship the migration as a `tsx` script under `scripts/`, idempotent, keyed on a stable natural key
(the CMS slug or id, stored in a column), so a re-run updates rather than duplicates.

```
export DATABASE_URL="mysql://…"          # tsx does NOT auto-load .env
npx tsx scripts/import-wp.ts --input ./scratch/wp-dump.json --dry-run
```

`--dry-run` prints counts per entity and every unmapped value, and writes nothing. Run it until the
unmapped list is empty or explicitly accepted.

### 4. Parity check before cutover

Point the new provider at the DB in a branch and compare, per route:

- row counts per category and per city;
- a diff of every public URL the sitemap emits (nothing 404s that used to 200);
- ten spot-checked detail pages, field by field, against the CMS render;
- structured data still valid on a detail page;
- the "open now" / hours logic on a business with a split schedule.

A URL that changes needs a redirect, in the same PR.

### 5. Cutover

1. Merge the importer and run it against production, once, with the CMS frozen.
2. Flip the provider (`NEXT_PUBLIC_BACKEND` or the one line) and deploy.
3. Watch for a day. Keep the CMS running but read-only.
4. **Then** delete the CMS provider, its env vars, the field-map doc, the `withFallback` wrapper and
   the seed provider if it no longer earns its keep — in one PR, so the repo never ends up with two
   half-live backends. Update the README and the roadmap in that same PR.

Do not skip step 4. A dormant provider behind an env var is a backend nobody tests and everybody
eventually turns on by accident.

## Hosting notes that bite on this stack

- MySQL on Hostinger + Drizzle; migrations are generated in the repo and **applied from a local
  machine**, not from a web session. Plan the PR order around that: a PR whose code needs a column
  that has not been applied yet will deploy and 500.
- `tsx` scripts do not load `.env`. Every runbook line in the README must export the vars first.
- Session secret, DB URL and any upload credentials go in the host's env panel, and a changed DB
  password must be updated there in the same sitting — see the `nextjs-deploy-hostinger` skill.
- Uploaded files must not live on the app's own disk: a redeploy wipes it. Use object storage and
  store the URL. Test it by simulating a redeploy before calling the upload done.
