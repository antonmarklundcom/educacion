---
name: wp-to-native-admin
description: Replace a WordPress/JetEngine (or any external CMS) backend with a first-party Next.js admin — auth foundation, role-based CRUD, moderation queue, owner-scoped portal, and the data cutover — on the Next.js + Drizzle + MySQL + Hostinger stack. Use this skill whenever the task is "get rid of WordPress", "build our own admin", "replace the WP panel", "we need an /admin to edit listings", "add login and roles", "admin CRUD", "moderation queue", "let the business edit its own profile", or migrating content out of a CMS into the app's own database. Proven on educacion.com.py (PR-18 → PR-22); written to be re-run on negocio.com.py and any later directory/listings site. Pair with nodejs-mysql-hostinger-stack (scaffold) and nextjs-deploy-hostinger (infra/env/deploy).
---

# WP → native admin

You are replacing an external CMS (WordPress + JetEngine, Airtable, a Google Sheet, whatever)
with an admin that lives inside the Next.js app and writes to the app's own MySQL database.

This was done end-to-end on **educacion.com.py** across five PRs. Everything below is what
that build actually taught, including the parts that were specified one way and shipped
another. Follow the sequence; do not invent a different one.

## 0. Before writing any code

Answer these four in the plan, in writing, before the first PR:

1. **What is the seam?** If the app already reads through one module (educacion: `src/db/queries/*`;
   negocio: `lib/listings-repo.ts` + `lib/providers/*`), the CMS is behind it and the swap is a new
   provider plus one line. If pages call `fetch(wp-json)` directly, **PR-0 is building that seam** —
   do not start the admin before it exists.
2. **What is the entity list?** Name every table the admin will edit, and which are staff-only vs
   owner-editable. This decides how many CRUD slices you write and where the scoping boundary sits.
3. **Who logs in?** Staff only (one role pair), or staff + business owners (four roles)? Owner login
   is what forces `scopeToInstitution`-style scoping and roughly doubles the work.
4. **Is the CMS the source of truth for anything after cutover?** If yes you have a sync problem,
   not a migration. Prefer: migrate once, delete the provider, never look back.

Do not build a self-serve owner portal before there are paying owners. On educacion the portal
(PR-21) was built and then **held back from launch** because password reset by email did not exist yet.
Shipping it would have created accounts nobody could recover.

## 1. The PR sequence

Each is one PR, in order. Dependencies are real — none of these can be parallelised.

| # | PR | Owner | Ships |
|---|----|-------|-------|
| A | **Data seam** (skip if it exists) | Opus | One module every page reads through. No page calls the CMS. |
| B | **Auth foundation** | Opus | Sessions, roles, password hashing, login/logout, forced password change, bootstrap script. |
| C | **Admin CRUD — core entities** | Sonnet → Opus review | `/admin` shell, one table component, one form component, CRUD for the main entities, activity log on every write. |
| D | **Admin CRUD — the awkward ones** | Sonnet → Opus review | Prices/history, verification/status, moderation queue, bulk actions, staleness dashboard. |
| E | **Owner portal** (only if owners log in) | Opus | Scoped dashboard + edit, review workflow for curated fields, member management. |
| F | **Migration + cutover** | Opus | Import from CMS → own tables, verify parity, delete the CMS provider. |

B is the one to get right. C and D are mechanical once B's two functions exist.

**Read `references/auth-foundation.md` before B, `references/admin-crud.md` before C and D,
`references/cutover.md` before F, and `references/review-checklist.md` before merging any of them.**

## 2. The rules that did not bend

These are non-negotiable, and every one of them caught a real bug in review.

1. **Every mutation calls `requireRole()` — inside the query module, not the server action.**
   A server action is directly reachable; Next.js does not re-run the `/admin` layout for it.
   The layout guard is a backstop. The boundary is `src/db/queries/admin/*`.
2. **Hidden buttons are UX, not access control.** Never let the UI be the only thing stopping a write.
3. **Every owner-scoped read filters on the session's id, never on an id from the request.**
   One function returns the only id allowed in a `WHERE` clause, and it *throws* on a mismatch
   rather than quietly substituting the session's own id.
4. **Every id in a URL path is an object reference and must be checked against the session before use.**
   Filtering the list you render is not enough — the read already happened, and the write will too.
5. **Non-existent and not-yours return the same error.** Different answers turn the URL space into
   an oracle for which ids are real.
6. **No SQL outside the query modules.** Components receive plain typed objects.
7. **Every write logs before/after to `activity_log`, in the same transaction as the mutation.**
   Called from inside the mutation, never from the route, so a new entity cannot ship without it.
8. **Never fabricate a value to satisfy a NOT NULL column.** A select with no known answer gets an
   empty leading option and fails validation. "Unknown" is a state the form must be able to be in.
9. **Server components by default.** In educacion's whole admin exactly **one** client component
   exists — the shared form, because `useActionState` is what keeps typed values on the page when
   validation fails. Everything else, including pagination and search, is a plain link or a `GET` form.
10. **Validation is pure and lives apart from the queries.** `FormData → {ok, data} | {ok:false, errors}`,
    no database, no session, no I/O — so every rule is unit-testable without MySQL.

## 3. The decisions worth copying verbatim

Each of these was reasoned out once and should not be re-litigated.

- **Roles are explicit, not a numeric ladder.** `admin > editor > owner_admin > owner_editor` is not
  a ladder: an owner_admin outranks an owner_editor *inside their own business* and has no standing
  outside it. Model it as "what each role satisfies" plus a separately-enforced scope boundary.
  A numeric level invites `level >= OWNER_ADMIN` checks that hand an owner a staff screen.
- **scrypt, not bcrypt.** bcrypt is a native module compiled against the Node ABI at install time.
  On Hostinger's managed Node, a platform upgrade turns every login into a 500 until someone SSHs
  in and rebuilds. `node:crypto`'s scrypt is standard library, memory-hard, zero dependencies.
  Store a self-describing hash — `scrypt$N$r$p$salt$key` — so parameters can be raised later without
  invalidating existing hashes, and read the parameters back out of the stored string on verify.
  OWASP floor is N=2^17, r=8, p=1; Node's default `maxmem` (32 MB) is **below** what that needs,
  so raise `maxmem` explicitly or it silently degrades.
- **Every login failure returns the identical message.** Unknown email, wrong password, suspended,
  no password set — one string. Keep the real reason for logs only. And hash against a decoy on the
  unknown-email path, or the timing difference is a user-enumeration oracle.
- **Check "suspended" *after* the password**, or suspension is detectable by response time.
- **The session cookie carries the minimum**: id, role, scope id, must-change-password flag. Name,
  email and plan are read from the DB at use time, so revoking access takes effect next request.
- **8-hour session TTL.** A working day, not a month.
- **No default password anywhere.** The bootstrap script generates a random one, prints it once,
  sets `must_change_password`, and **refuses to run if an active admin already exists** — otherwise
  it is a shell backdoor for minting admins.
- **`/admin` 404s for the unauthorised, not 403.** "This exists but you may not see it" is itself
  information. A publicly-advertised owner portal can redirect instead — its existence is not secret.
- **`export const dynamic = 'force-dynamic'` on every admin route.** A session is per-request. This
  was a real bug: `/admin` was a static placeholder, so any guard added to it would never have run.
- **A price is superseded, not edited.** The previous current row becomes history in the same
  transaction. Keep an `update` path only as an explicitly-logged *correction* — an edit destroys
  the record of what you published last year, which is exactly what a disputing business asks about.
- **Retire rows with the table's own honest field** (`is_current = false`, `is_active = false`),
  not a generic `archived` status bolted onto every table.
- **A moderation queue's "approve" must call the importer's own write path**, not a second one.
  Export the importer's insert/update rather than reimplementing it, or approved data can take a
  route the importer would have refused.
- **Bulk verify is the dangerous action.** It can silently extend the life of a wrong number. Frame
  it as a dated human assertion: capped, nothing selected by default, every affected id logged.
- **Assert the citation-style rules twice** — in the form (for the message) and in the query module
  (because the form is not the only caller).
- **Owner-editable vs curated is a deliberate split.** Owners are the authority on their own
  commercial facts (prices, hours, contact) — those publish directly. Register-derived or
  trust-bearing fields (accreditation, verified flag) enter review or are not editable at all.
  Publication `status` is not owner-editable: un-publishing a live page is undetectable from outside.

## 4. Tests that are worth writing (and the ones that lied)

- A test per entity asserting **every mutation throws when called with no session**, invoked
  directly against the query module. Cheap, and it is what stops a new entity shipping unguarded.
- Cross-owner access tests that hit the **route handlers**, not the UI. On educacion this found two
  real bugs before merge: one action validated fields *before* authorizing, and —
- **the access test's own first version passed with the guard deleted.** It asserted "an error came
  back", and validation errors are errors too. Rewrite such tests to canary on the *write*: attempt
  the cross-owner mutation, then assert the target row is unchanged.
- Pure-function tests for validation, role satisfaction, scope resolution, and the activity-log row
  shape. All of these run without a database, which is the reason they keep running.

## 5. What to hand Sonnet

C and D are Sonnet work. Give it, per entity: the table's columns, the field list, the label map,
the list-page columns, and a pointer to an already-merged entity slice to copy. Tell it explicitly:

> Copy the shape of `<existing entity>` exactly. Do not introduce a new form component, a new table
> component, or a second validation style. Every mutation calls requireRole and logs activity.
> No client components. If a column has no honest default, leave the select empty and fail validation.

Then review against `references/review-checklist.md` before merge.
