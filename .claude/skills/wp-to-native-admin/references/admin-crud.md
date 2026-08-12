# PRs C & D — the admin itself

The whole point of the shape below: **an entity gains a full CRUD surface by writing a field list and
a column list, not by writing a table or a form.** On educacion, twelve admin sections share exactly
two UI components and one client component in total.

## Files per entity (copy this exactly)

```
src/db/queries/admin/<entity>.ts     all SQL, requireRole inside every function, activity log
src/lib/admin/validation.ts          pure FormData → parsed input (one file, all entities)
src/app/admin/<entity>/fields.ts     FieldDef[] — the form, as data
src/app/admin/<entity>/actions.ts    'use server' — parse, call query, revalidate, redirect
src/app/admin/<entity>/page.tsx      list: search + AdminTable
src/app/admin/<entity>/nuevo/page.tsx    AdminForm + create action
src/app/admin/<entity>/[id]/page.tsx     AdminForm + update action + archive
```

Every `page.tsx` under `/admin`:

```ts
export const dynamic = 'force-dynamic';                       // a session is per-request
export const metadata = { robots: { index: false, follow: false } };
```

## The shell

```tsx
// src/app/admin/layout.tsx
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }) {
  const user = await currentUser();
  try { requireRole(user, ['editor']); } catch { notFound(); }   // 404, not 403
  return (…<AdminNav />{children}…);
}
```

This guard is a **backstop**. A server action is reachable without ever rendering this layout, so
the real boundary is the query module. Say so in a comment; it is the single most re-derived fact.

`AdminNav` is a plain `<ul>` of `<a>` — no active-state JS, no client component.

## `AdminTable` — a server component

```ts
export interface AdminColumn<Row> {
  header: string;
  cell: (row: Row) => React.ReactNode;
  numeric?: boolean;     // monospace for anything numeric
}

export interface AdminTableProps<Row extends { id: number }> {
  columns: AdminColumn<Row>[];
  rows: Row[];
  editHref: (row: Row) => string;
  emptyLabel: string;                       // honest per-context copy, not "No results"
  page: number; totalPages: number;
  buildPageHref: (page: number) => string;  // pagination is a LINK, so no client state
}
```

Search on the list page is a plain `<form method="GET">`. No `useState`, no debounce, no client
component. The list query takes `{ q, page }` and returns `{ rows, total, page, pageSize }`.

## `AdminForm` — the only client component in the admin

Justify it in one line in the PR body, and reuse this one instance everywhere:

> Client component: `useActionState` keeps submitted values on the DOM and shows field errors inline
> when validation fails. The alternative — throwing to the nearest `error.tsx` — discards everything
> the user typed on every mistake.

```ts
export type FieldDef =
  | { type:'text'|'email'|'url'; name:string; label:string; required?:boolean; maxLength?:number }
  | { type:'number'; name:string; label:string; required?:boolean; min?:number; max?:number }
  | { type:'textarea'; name:string; label:string; rows?:number }
  | { type:'select'; name:string; label:string; options:{value:string;label:string}[];
      required?:boolean;
      /** Shown as the EMPTY option. Never a fabricated default. */
      placeholder?: string }
  | { type:'checkbox'; name:string; label:string }
  | { type:'file'; name:string; label:string; accept?:string; hint?:string };

export interface AdminFormState { errors?: Record<string,string>; formError?: string }
export type AdminFormAction = (prev: AdminFormState, fd: FormData) => Promise<AdminFormState>;
```

`defaultValues` is `Record<string, unknown>` on purpose — an entity row is spread straight in and
carries `Date`s and enum unions the form never renders; only keys matching a field `name` are read.
Set `encType="multipart/form-data"` automatically when any field is `type:'file'`.

Field errors render under their input with `aria-describedby` / `aria-invalid`; `formError` renders
as `role="alert"` at the top.

## `fields.ts` — the form as data

```ts
export function listingFields(): FieldDef[] {
  return [
    { type:'text',   name:'name',  label:'Nombre',  required:true, maxLength:320 },
    { type:'text',   name:'slug',  label:'Slug (dejalo vacío para generarlo)', maxLength:160 },
    { type:'select', name:'categoria', label:'Rubro', required:true,
      options: CATEGORIES.map(c => ({ value:c.slug, label:c.label })) },
    // No `<option selected>` and no placeholder fallback: the empty option is the only
    // unselected state, which is what forces a human to pick rather than defaulting.
    { type:'select', name:'status', label:'Estado', required:true,
      options: PUBLICATION_STATUS.map(v => ({ value:v, label: STATUS_LABELS[v] })) },
    { type:'file',   name:'logo',  label:'Logo', accept:'image/png,image/jpeg,image/webp',
      hint:'PNG, JPG o WEBP, hasta 2 MB. Se sube a almacenamiento externo y sobrevive a los redeploys.' },
  ];
}
```

Fields the admin must **not** be able to invent (a verification flag, an accreditation status, a
rating) simply do not appear in this list. That is the enforcement.

## `validation.ts` — pure, one file, no I/O

```ts
export type ParseResult<T> = { ok:true; data:T } | { ok:false; errors:Record<string,string> };
```

Small private helpers reused by every entity: `str`, `optStr`, `checkbox`, `optInt`, `requireInt`,
`requireStr(…, maxLength)`, `requireEnum`, `optionalPhone`, plus a `SLUG_PATTERN`. Accumulate into
one `errors` object and return it whole so the form shows every problem at once.

No database, no session, no clock read. This is what lets every rule be unit-tested without MySQL.

## `actions.ts`

```ts
'use server';

export async function createListingAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const user = await currentUser();

  const parsed = parseListingInput(fd);
  if (!parsed.ok) return { errors: parsed.errors };

  if (parsed.data.slug && await isSlugTaken(parsed.data.slug, null)) {
    return { errors: { slug: 'Ese slug ya está en uso.' } };
  }

  let id: number;
  try { id = await createListing(user, parsed.data); }        // requireRole lives in here
  catch (e) { return { formError: messageFor(e) }; }

  revalidatePath('/admin/listings');
  redirect('/admin/listings');
}
```

The action **does not** call `requireRole` in place of the query module doing it. It may call it as
well; it may not call it instead.

File uploads: upload after the row exists (you need its slug/id for the key), and on failure
redirect to the edit page with the error in a query param rather than losing the whole save.

## `queries/admin/<entity>.ts`

```ts
export async function createListing(actor: SessionUser | null, input: ListingInput, database: Db = defaultDb) {
  requireRole(actor, ['editor']);                    // BEFORE touching the database

  return database.transaction(async (tx) => {
    const slug = uniqueSlug(input.slug ?? input.name, await existingSlugs(tx));
    const matchKey = buildMatchKey(input.name);      // derived, never a form field
    const [res] = await tx.insert(listings).values({ …input, slug, matchKey });

    await logActivity(tx, {                          // same transaction, always
      userId: actor.id, entityType: 'listing', entityId: res.insertId,
      action: 'create', before: null, after: { …input, slug },
    });
    return res.insertId;
  }).then(async (id) => { await rebuildSearchIndex(); return id; });
}
```

Every list/read function takes `actor` and calls `requireRole` too — a leaked read is still a leak.
Take `database: Db = defaultDb` as the last parameter on every function so tests can inject.

## `activity-log.ts`

```ts
/** Structural, not `Db`: mutations call this from inside db.transaction, and
 *  Drizzle's tx handle is not assignable to Db even though .insert is identical. */
export type Writable = Pick<Db, 'insert'>;

/** Pure — create ⇒ before:null, delete ⇒ after:null, update ⇒ both. Unit-testable. */
export function buildActivityLogRow(entry: ActivityLogEntry): typeof activityLog.$inferInsert { … }
export async function logActivity(db: Writable, entry: ActivityLogEntry): Promise<void> { … }
```

Never pass a `users` row through here — the snapshots must never contain `password_hash`.

## PR D — the awkward entities

- **Prices / any dated fact.** Supersede, do not edit: mark the current row historical and insert
  the new one in the same transaction. Keep an `update` path only as a *correction*, logged
  distinguishably. Enforce a freshness rule (e.g. nothing older than 12 months is displayed
  anywhere — page, comparison, JSON-LD, OG image) in one place both admin and public read.
- **Verification / trust fields.** A positive status requires a source URL or a document reference.
  Assert it twice: in the form for the message, and in the query module because the form is not the
  only caller.
- **Moderation queue.** "Approve" calls the importer's own insert/update — export them from the
  import module rather than reimplementing. "Merge" is approve with a narrower diff, not a third
  write path. Handle a full import cycle without manual SQL, or the queue is not done.
- **Bulk verify.** Capped, nothing selected by default, every affected id written to the log. It is
  a dated human assertion, not a refresh button.
- **Staleness dashboard.** One page listing what is about to expire, by entity. This is what makes
  the freshness rule survivable in practice.
