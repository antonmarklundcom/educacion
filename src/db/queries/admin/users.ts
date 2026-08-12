/**
 * Staff and institution accounts — the `/admin/usuarios` screen (PR-36).
 * Rules 4 and 5.
 *
 * ### Why this exists at all, and why now
 *
 * Before this PR there were exactly two ways for anybody to get a login, and
 * **both of them needed working email**: the claim flow (PR-22) mails a token
 * to an address on the institution's domain, and PR-35's reset mails a link.
 * `bootstrap-admin.ts` mints the first staff account and refuses to run twice,
 * on purpose. So with Resend unconfigured the site could not onboard a single
 * institution — not a missing nicety, a closed front door.
 *
 * This module opens a second door that does not touch the network:
 * **an admin creates the account and generates a one-time link, which they
 * hand over by WhatsApp or on the phone.** The link is the same
 * `password_reset_tokens` row PR-35 built — same digest at rest, same
 * single-use `UPDATE … WHERE used_at IS NULL`, same invalidation of the
 * user's other outstanding links when it is spent. What changes is the
 * delivery channel and, with it, the TTL (72 h — `reset-token.ts`).
 *
 * ### The link is shown once and never stored
 *
 * `issueAccessLink` returns the plaintext token to the caller and keeps only
 * its SHA-256 digest. Nothing writes it to `activity_log`, and reloading the
 * page does not show it again: an admin who loses it generates another, which
 * is cheap, rather than the site keeping a table of live credentials in
 * readable form.
 *
 * ### Four refusals, each of them a hole that would otherwise exist
 *
 * 1. **`admin`, never `editor`.** Every function here calls
 *    `requireRole(actor, ['admin'])`. This screen mints logins; `editor` is
 *    the data-curation role, and `roles.ts` is explicit that the roles are not
 *    a ladder. An editor who could issue an access link for an admin account
 *    would be an admin.
 * 2. **A staff role may not carry an institution, and an institution role must.**
 *    A `SessionUser` with both is a scope question nobody has answered; a
 *    `institution_admin` with no institution is an account that can reach
 *    `/panel` and see nothing. Refused at the boundary rather than rendered.
 * 3. **No link for a suspended account.** Suspension is how access is revoked;
 *    a link that revives it silently would make the revocation advisory.
 * 4. **An admin cannot suspend themselves.** It is unrecoverable without
 *    another admin or a shell, and the bootstrap script refuses to run once an
 *    active admin exists — so the recovery path for "I suspended the last
 *    admin" is a database edit.
 *
 * An admin *can* issue a link for another admin's account. That is lateral,
 * not escalation — they already hold the role — and it is what makes "the
 * other admin is on leave and locked out" solvable. `activity_log` records who
 * issued it, for whom, and when.
 */

import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { institutionMembers, institutions, passwordResetTokens, users } from '@/db/schema';
import { AuthError, INSTITUTION_ROLES, requireRole, STAFF_ROLES } from '@/lib/auth/roles';
import type { SessionUser, UserRole } from '@/lib/auth/session';
import { adminLinkExpiry, createResetToken } from '@/lib/auth/reset-token';

import { logActivity } from './activity-log';

export interface AdminUserRow {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  status: (typeof users.$inferSelect)['status'];
  institutionId: number | null;
  institutionName: string | null;
  /** False for an invited account that has never set a password. */
  canSignIn: boolean;
  /** Number of unspent, unexpired links outstanding — an admin should know. */
  liveLinks: number;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export async function listUsers(
  actor: SessionUser | null | undefined,
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<AdminUserRow[]> {
  requireRole(actor, ['admin']);

  const rows = await database
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      institutionId: users.institutionId,
      institutionName: institutions.nameShort,
      hasPassword: sql<number>`${users.passwordHash} is not null`,
      liveLinks: sql<number>`(
        select count(*) from ${passwordResetTokens}
        where ${passwordResetTokens.userId} = ${users.id}
          and ${passwordResetTokens.usedAt} is null
          and ${passwordResetTokens.expiresAt} > ${now}
      )`,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(institutions, eq(institutions.id, users.institutionId))
    .orderBy(asc(users.role), asc(users.email));

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    institutionId: row.institutionId,
    institutionName: row.institutionName ?? null,
    canSignIn: row.status === 'active' && Number(row.hasPassword) === 1,
    liveLinks: Number(row.liveLinks),
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  }));
}

export interface CreateUserInput {
  email: string;
  name: string | null;
  role: UserRole;
  /** Required for the institution roles, forbidden for the staff ones. */
  institutionId: number | null;
}

/**
 * Creates an account with **no password** and `status = 'invited'`.
 *
 * `authenticate` refuses both, so the row is inert until somebody spends an
 * access link. That is the same shape as PR-21's `inviteMember`, and it is why
 * this function never takes a password argument: an admin typing a password on
 * behalf of somebody else means the admin knows that person's credential, and
 * the whole point of the link is that nobody does.
 */
export async function createUser(
  actor: SessionUser | null | undefined,
  input: CreateUserInput,
  database: Db = defaultDb,
): Promise<number> {
  requireRole(actor, ['admin']);
  const actorId = actor!.id;

  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Esa dirección de correo no parece válida.');
  }

  // Refusal 2. Stated as two checks rather than one, so the message names the
  // thing that is wrong.
  const isStaffRole = (STAFF_ROLES as readonly UserRole[]).includes(input.role);
  const isInstitutionRole = (INSTITUTION_ROLES as readonly UserRole[]).includes(input.role);
  if (isStaffRole && input.institutionId != null) {
    throw new Error('Una cuenta del equipo no se vincula a una institución.');
  }
  if (isInstitutionRole && input.institutionId == null) {
    throw new Error('Elegí la institución a la que pertenece esta cuenta.');
  }

  const [existing] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    throw new Error('Ya existe una cuenta con ese correo.');
  }

  return database.transaction(async (tx) => {
    const [inserted] = await tx.insert(users).values({
      email,
      name: input.name,
      passwordHash: null,
      role: input.role,
      institutionId: input.institutionId,
      status: 'invited',
      mustChangePassword: false,
    });
    const userId = Number(inserted.insertId);

    // The membership row is what `/panel` reads; `users.institution_id` is the
    // denormalized convenience the session reads at login (§7.1). Both, or the
    // account is scoped by one and not the other.
    if (isInstitutionRole && input.institutionId != null) {
      await tx.insert(institutionMembers).values({
        userId,
        institutionId: input.institutionId,
        role: input.role as 'institution_admin' | 'institution_editor',
      });
    }

    await logActivity(tx, {
      userId: actorId,
      entityType: 'user',
      entityId: userId,
      action: 'create',
      before: null,
      after: { email, role: input.role, institutionId: input.institutionId },
    });

    return userId;
  });
}

export interface AccessLink {
  /** The plaintext token. Shown once, never stored, never logged. */
  token: string;
  email: string;
  expiresAt: Date;
}

/**
 * Mints a link the admin hands over out of band.
 *
 * Any outstanding link for the same user is invalidated first: two live links
 * for one account is two chances for the wrong one to be forwarded, and an
 * admin generating a second one has already decided the first is lost.
 */
export async function issueAccessLink(
  actor: SessionUser | null | undefined,
  targetUserId: number,
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<AccessLink> {
  requireRole(actor, ['admin']);
  const actorId = actor!.id;

  const [target] = await database
    .select({ id: users.id, email: users.email, status: users.status })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!target) throw new Error('Esa cuenta no existe.');

  // Refusal 3 — suspension is the revocation, so it outranks this.
  if (target.status === 'suspended') {
    throw new AuthError(
      'Esa cuenta está suspendida. Reactivala primero si querés darle acceso.',
      'forbidden',
    );
  }

  const { token, tokenHash } = createResetToken();
  const expiresAt = adminLinkExpiry(now);

  await database.transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.userId, target.id), isNull(passwordResetTokens.usedAt)));

    await tx.insert(passwordResetTokens).values({ userId: target.id, tokenHash, expiresAt });

    await logActivity(tx, {
      userId: actorId,
      entityType: 'user',
      entityId: target.id,
      action: 'update',
      before: null,
      // Who issued it, for whom, until when. Never the token, never the digest:
      // the log is read by more people than the table is.
      after: { accessLinkIssued: true, expiresAt: expiresAt.toISOString() },
    });
  });

  return { token, email: target.email, expiresAt };
}

/**
 * Suspend or reactivate.
 *
 * Suspending also **kills every outstanding link** for that account. A
 * revocation that left a live link in somebody's WhatsApp thread would be a
 * revocation with a timer on it.
 */
export async function setUserStatus(
  actor: SessionUser | null | undefined,
  targetUserId: number,
  status: 'active' | 'suspended',
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<void> {
  requireRole(actor, ['admin']);
  const actorId = actor!.id;

  // Refusal 4.
  if (targetUserId === actorId) {
    throw new Error('No podés suspender tu propia cuenta.');
  }

  const [target] = await database
    .select({ id: users.id, status: users.status, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) throw new Error('Esa cuenta no existe.');

  // Reactivating an account that never set a password returns it to `invited`,
  // not to `active`: `active` with a null hash is a state `authenticate`
  // refuses anyway, and showing it as active would be a lie on this screen.
  const next = status === 'active' && target.passwordHash == null ? 'invited' : status;

  await database.transaction(async (tx) => {
    await tx.update(users).set({ status: next }).where(eq(users.id, target.id));

    if (status === 'suspended') {
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(and(eq(passwordResetTokens.userId, target.id), isNull(passwordResetTokens.usedAt)));
    }

    await logActivity(tx, {
      userId: actorId,
      entityType: 'user',
      entityId: target.id,
      action: 'update',
      before: { status: target.status },
      after: { status: next },
    });
  });
}

/** Institutions that have nobody able to sign in — the onboarding worklist. */
export async function institutionsWithoutAccess(
  actor: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<{ id: number; name: string }[]> {
  requireRole(actor, ['admin']);

  const rows = await database
    .select({ id: institutions.id, name: institutions.nameShort })
    .from(institutions)
    .leftJoin(
      institutionMembers,
      and(
        eq(institutionMembers.institutionId, institutions.id),
        // A membership only counts when the account behind it can actually
        // sign in — an invited row that never spent a link is not access.
        sql`exists (
          select 1 from ${users}
          where ${users.id} = ${institutionMembers.userId}
            and ${users.status} = 'active'
            and ${users.passwordHash} is not null
        )`,
      ),
    )
    .where(and(eq(institutions.status, 'published'), isNull(institutionMembers.id)))
    .orderBy(asc(institutions.nameShort));

  return rows;
}
