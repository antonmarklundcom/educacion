# PR B — Auth foundation

Everything the later PRs build against. Four files in `src/lib/auth/`, two tables, one script.

## Tables

```
users
  id, email (unique), name, password_hash (nullable),
  role enum('admin','editor','owner_admin','owner_editor'),
  status enum('active','suspended'),
  must_change_password boolean default false,
  created_at, updated_at

owner_members            -- only if business owners log in
  id, user_id, owner_id, role, created_at
  unique (user_id, owner_id)

activity_log
  id, user_id, entity_type, entity_id, action enum('create','update','delete','archive'),
  before_json json, after_json json, created_at
```

`password_hash` is nullable so an invited-but-unset account exists without a usable credential.
That state must fail login with the *same* message as a wrong password.

## `session.ts` — the cookie

`iron-session` over `next/headers` cookies. The whole file exists to enforce one rule: **nothing the
client sends is trusted except the sealed cookie.** No `x-user-role` header, no role in a query
string, no client component reporting who it thinks it is.

```ts
export interface SessionUser {
  id: number;
  role: UserRole;
  /** The business/institution this session is scoped to, or null for staff. */
  ownerId: number | null;
  mustChangePassword: boolean;
}

export const SESSION_TTL_SECONDS = 8 * 60 * 60;   // a working day, not a month

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // Fail loudly at boot. A development default would inevitably reach production.
    throw new Error('SESSION_SECRET is missing or shorter than 32 characters. ' +
      'Generate one with `openssl rand -base64 32`.');
  }
  return secret;
}

export function sessionOptions(): SessionOptions {
  return {
    password: sessionSecret(),
    cookieName: '<app>_session',
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',  // off in dev only — no TLS to be secure over
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    },
  };
}

/** Never throws — a malformed cookie is an anonymous request, not a crash. */
export async function currentUser(): Promise<SessionUser | null> {
  try { return (await getSession()).user ?? null; } catch { return null; }
}
```

Keep the payload minimal (id, role, scope, flag). Read name/email/plan from the DB at use time so
revocation takes effect on the next request rather than when a stale cookie expires.

## `roles.ts` — the two functions everything else builds against

Both are **pure over a `SessionUser`**, which is what makes the negative cases testable without a
browser, a cookie or a database. Their signatures are as much of the deliverable as their behaviour.

```ts
export const STAFF_ROLES = ['admin', 'editor'] as const;
export const OWNER_ROLES = ['owner_admin', 'owner_editor'] as const;

/**
 * What each role satisfies. Deliberately NOT a numeric ladder: an owner_admin
 * outranks an owner_editor *within their own business* and has no standing
 * outside it. `level >= OWNER_ADMIN` checks are how an owner gets a staff screen.
 * `admin` satisfies the staff roles only — an admin acting on one business's
 * data does so through a staff screen with the id passed explicitly.
 */
const SATISFIES: Record<UserRole, readonly UserRole[]> = {
  admin:        ['admin', 'editor'],
  editor:       ['editor'],
  owner_admin:  ['owner_admin', 'owner_editor'],
  owner_editor: ['owner_editor'],
};

export class AuthError extends Error {
  constructor(message: string, readonly reason: 'unauthenticated' | 'forbidden') {
    super(message); this.name = 'AuthError';
  }
}

export function hasRole(user, allowed: readonly UserRole[]): boolean { … }

/**
 * Throws rather than returning a boolean: a caller that forgets to check a
 * returned `false` still ships; a caller that forgets to await this does not
 * get past review.
 */
export function requireRole(user: SessionUser | null, allowed: readonly UserRole[]): SessionUser {
  if (!user) throw new AuthError('No hay sesión iniciada.', 'unauthenticated');
  if (!hasRole(user, allowed)) throw new AuthError('No tenés permiso para esto.', 'forbidden');
  return user;
}

/**
 * The ONLY id a caller may put in a WHERE clause.
 * - Staff may act on any business, but must say which: `requested` is required.
 * - An owner always gets their own id. A mismatched request THROWS — it is not
 *   silently coerced, because it is either a bug or an attack and both deserve
 *   to be loud.
 */
export function scopeToOwner(user: SessionUser | null, requested?: number | null): number { … }
```

Passing a raw `searchParams` value straight to a query is the bug `scopeToOwner` exists to prevent.

### The second boundary, for owner routes

Filtering a query by owner id is necessary and **not sufficient**. `/panel/listing/57` is a URL the
owner can edit; if the handler loads row 57 and only filters the list it renders, the read already
happened and the write will too. So every owner entry point resolves the owning business of the row
it was handed and compares it:

```ts
/** Pure — which is what lets the cross-owner cases be tested exhaustively. */
export function assertSameOwner(user, owner: number | null | undefined): number {
  const scope = panelOwnerId(user);
  // `owner == null` (row does not exist) is deliberately NOT distinguished from
  // "exists, belongs to someone else": 404 vs 403 turns the URL space into an
  // oracle for which ids are real.
  if (owner == null || owner !== scope) throw new AuthError('…', 'forbidden');
  return scope;
}

// One ownership lookup per entity, then one `assertOwns<Entity>` guard per entity.
export async function listingOwnerId(id: number, db = defaultDb): Promise<number | null> { … }
export async function assertOwnsListing(user, id: number, db = defaultDb) {
  return assertSameOwner(user, await listingOwnerId(id, db));
}
```

Resolve ownership through the canonical parent (a photo through its listing, a price through its
offering through its programme), not through a shared side table — a shared table opens a hole.

## `password.ts` — scrypt

```ts
export const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1 } as const;  // OWASP floor
const MAX_MEM = 256 * 1024 * 1024;   // Node's default 32 MB is BELOW what N=2^17 needs (~134 MB)
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 1024;  // unbounded input on an unauthenticated endpoint
```

Stored format `scrypt$N$r$p$<salt b64>$<key b64>`. `verifyPassword` reads N/r/p **out of the stored
string** rather than assuming today's constants; `needsRehash` tells the login path when a hash was
made with weaker settings, and login transparently upgrades it. Compare with `timingSafeEqual`.

## `login.ts` — the decision, split out of the route

The route's job is to call this and set a cookie. Every judgement about whether a sign-in is allowed
lives here, so it can be tested without a request, a cookie or a form.

```ts
export const LOGIN_ERROR = 'Correo o contraseña incorrectos.';   // for EVERY failure

export async function authenticate(account, password, ownerId): Promise<LoginResult> {
  if (!password) return { ok: false, reason: 'invalid_input' };

  if (!account)              { await verifyPassword(password, await decoy()); return { ok:false, reason:'unknown_email' }; }
  if (!account.passwordHash) { await verifyPassword(password, await decoy()); return { ok:false, reason:'no_password_set' }; }

  const correct = await verifyPassword(password, account.passwordHash);
  if (!correct) return { ok: false, reason: 'wrong_password' };

  // AFTER the password, so a suspended account is not distinguishable by timing.
  if (account.status === 'suspended') return { ok: false, reason: 'suspended' };

  return { ok: true, user: {…}, rehashTo: needsRehash(account.passwordHash) ? await hashPassword(password) : undefined };
}
```

The decoy hash is built lazily and cached — building it at module load slows every cold start for a
path most requests never take. `reason` is for logs, never for the response body.

## The forced-password-change loop

`must_change_password = true` on the account → after login, every admin route redirects to
`/cambiar-contrasena` (or equivalent) until it is cleared. That page re-authenticates with the
current password, clears the flag, and re-issues the cookie. This is what makes the bootstrap
credential worth exactly one sign-in.

## `scripts/bootstrap-admin.ts`

```
export DATABASE_URL="mysql://…"
export SESSION_SECRET="…"
npx tsx scripts/bootstrap-admin.ts --email admin@example.com --name "Nombre"
```

Three properties, each deliberate:

1. **No default password.** Generates `randomBytes(24).toString('base64url')`, prints it once.
   A constant in a repo is a credential in a repo, on the internet within a week of the first deploy.
2. **Creates with `must_change_password = true`.**
3. **Refuses to run when an active admin exists.** Otherwise it is a shell backdoor for minting
   admins that bypasses the admin UI's own logging.

`tsx` does **not** auto-load `.env` — set the vars in the shell (see the deploy skill).

## Deferrals that are allowed, and the one condition

Password reset by email needs a `password_reset_tokens` table (a migration, run from a local
machine) and a mail integration. It is fine to defer it — **but an owner portal must not be
announced to real businesses until it lands**, because a locked-out owner would then only be
recoverable by an admin. Say so in the invite form's copy rather than promising a mail that never
arrives.
