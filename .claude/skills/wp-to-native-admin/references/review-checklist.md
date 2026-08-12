# Review checklist

Run this before merging any admin PR. Each line failed at least once on the educacion build.

## Authorization

- [ ] Every exported mutation in `src/db/queries/admin/*` calls `requireRole` **as its first
      statement**, before any database call. Grep for `export async function` in that directory and
      check each one individually.
- [ ] Every exported read in those modules does too.
- [ ] No server action relies on the layout guard. The layout is a backstop; the query module is the
      boundary.
- [ ] No owner-scoped query takes an id from `searchParams`, `params`, or `FormData` and puts it in
      a `WHERE` clause without passing it through the scope function first.
- [ ] Every `[id]` route under an owner portal calls its `assertOwns<Entity>` guard **before**
      validating the form, not after. (This was a real bug: one action validated first, so a
      cross-owner attempt with valid data got further than it should have.)
- [ ] Row-not-found and row-not-yours return the same error.
- [ ] `export const dynamic = 'force-dynamic'` on every admin/portal route and layout.
- [ ] Nothing under `/admin` is indexable (`robots: { index: false }`).

## Data honesty

- [ ] No select ships with a fabricated default for a value the app does not know. The empty option
      is the only unselected state and validation rejects it.
- [ ] Fields the admin must not be able to invent (verification flags, accreditation, ratings,
      counts) are absent from `fields.ts`, not merely disabled in the UI.
- [ ] Any positive trust claim requires a source URL or document reference — asserted in the query
      module as well as the form.
- [ ] Freshness rules are enforced in one shared place read by page, comparison view, JSON-LD and
      OG image alike.
- [ ] Dated facts are superseded, not overwritten; a genuine correction is logged as a correction.

## Audit and side effects

- [ ] Every write calls `logActivity` from **inside** the same transaction as the mutation.
- [ ] Before/after snapshots never contain `password_hash` or any credential.
- [ ] Anything derived (slug, match key, search index) is derived in the query module, not submitted
      by the form, and uses the same helper the importer uses.
- [ ] The search index rebuild (or equivalent cache invalidation) happens after writes, in the
      mutation, so a caller cannot reach one without the other.
- [ ] `revalidatePath` on the list route after create/update/archive.

## Shape

- [ ] No new form component, no new table component, no second validation style. Two shared
      components, one client component, full stop.
- [ ] Any new client component carries a one-line justification in the PR body.
- [ ] No SQL outside the query modules.
- [ ] Every query function takes `database: Db = defaultDb` as its last parameter.
- [ ] Validation is pure: no session, no DB, no clock, no `fetch`.

## Tests

- [ ] A "throws with no session" test exists for every mutation of every entity, invoked directly
      against the query module.
- [ ] Cross-owner tests hit the route handlers, not the UI.
- [ ] **Canary check:** delete a guard locally and re-run the access tests. If they still pass, the
      tests are asserting "an error came back" and validation errors satisfied them. Rewrite them to
      attempt the write and then assert the target row is unchanged. Restore the guard.
- [ ] Pure tests for role satisfaction, scope resolution, validation rules and the activity-log row
      shape — all runnable without a database.
- [ ] `npm run build` and `npm run lint` pass.

## Copy and UI

- [ ] Spanish UI copy is Paraguayan voseo (`contactanos`, `solicitá`, `compará`, `elegí`, `tenés`),
      currency formatted `Gs. 1.450.000`. Repo, docs and comments stay in English.
- [ ] Empty states say something true and specific to the context, not "No results".
- [ ] Numeric columns render monospace.

## Docs

- [ ] The architecture doc records every decision this PR settled that the plan did not — especially
      the deliberate deviations. On educacion that record is the reason none of these were
      re-litigated later.
- [ ] One PR, one concern. The relevant doc is updated in the same PR as the decision.
