/**
 * Member management for `institution_admin` (PR-21). Rules 4 and 5.
 *
 * This is the most dangerous surface in the panel, because it decides **who can
 * sign in**. Four rules, each of them a hole that would otherwise exist:
 *
 * 1. **`requirePanelAdmin`, not `panelInstitutionId`.** An `institution_editor`
 *    may edit data and may not change the membership list. `roles.ts` is
 *    explicit that the roles are not a ladder, so this is a separate check
 *    rather than a comparison.
 *
 * 2. **A staff account can never be attached to an institution from here.** An
 *    `institution_admin` who invites the email address of an `admin` or
 *    `editor` would otherwise attach a staff user to their institution — and
 *    while that does not grant *them* anything, it puts a staff user's id on an
 *    institution row and is exactly the kind of state nobody audits. Refused.
 *
 * 3. **A user who already belongs to another institution is refused.**
 *    `architecture.md` §7.1: a user belonging to two institutions is scoped to
 *    neither, so "inviting" one would silently lock them out of the institution
 *    they already work for. That is an attack shaped like a typo.
 *
 * 4. **An invited member cannot sign in until an admin sets their password.**
 *    The row is created with `status = 'invited'` and a null `password_hash`,
 *    and `authenticate` refuses both. Password reset by email is the thing
 *    PR-18 deferred; until it lands, minting a credential from here would be
 *    minting one nobody verified. See the note at the bottom of this file.
 */

import { and, eq, ne, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { institutionMembers, users } from '@/db/schema';
import { logActivity } from '@/db/queries/admin/activity-log';
import { AuthError, isStaff } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';

import { requirePanelAdmin, panelInstitutionId } from './scope';

export type MemberRole = 'institution_admin' | 'institution_editor';

export interface PanelMember {
  userId: number;
  email: string;
  name: string | null;
  role: MemberRole;
  status: (typeof users.$inferSelect)['status'];
  canSignIn: boolean;
  createdAt: Date;
}

/** Reading the list needs only panel access; changing it needs admin. */
export async function listMembers(
  user: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<PanelMember[]> {
  const institutionId = panelInstitutionId(user);

  const rows = await database
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: institutionMembers.role,
      status: users.status,
      hasPassword: sql<number>`${users.passwordHash} is not null`,
      createdAt: institutionMembers.createdAt,
    })
    .from(institutionMembers)
    .innerJoin(users, eq(users.id, institutionMembers.userId))
    .where(eq(institutionMembers.institutionId, institutionId))
    .orderBy(users.email);

  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    canSignIn: row.status === 'active' && Number(row.hasPassword) === 1,
    createdAt: row.createdAt,
  }));
}

export interface InviteResult {
  userId: number;
  /** True when the account had to be created rather than attached. */
  created: boolean;
}

export async function inviteMember(
  user: SessionUser | null | undefined,
  input: { email: string; name: string | null; role: MemberRole },
  database: Db = defaultDb,
): Promise<InviteResult> {
  const institutionId = requirePanelAdmin(user);
  const actorId = user!.id;

  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Esa dirección de correo no parece válida.');
  }

  const [existing] = await database.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    // Rule 2 — never attach a staff account to an institution from here.
    if (isStaff({ role: existing.role })) {
      throw new AuthError(
        'Esa dirección pertenece a una cuenta del equipo de educacion.com.py. Escribinos si necesitás vincularla.',
        'forbidden',
      );
    }

    // Rule 3 — a second institution would scope them to neither.
    const [otherMembership] = await database
      .select({ institutionId: institutionMembers.institutionId })
      .from(institutionMembers)
      .where(
        and(
          eq(institutionMembers.userId, existing.id),
          ne(institutionMembers.institutionId, institutionId),
        ),
      )
      .limit(1);

    if (
      otherMembership ||
      (existing.institutionId != null && existing.institutionId !== institutionId)
    ) {
      throw new AuthError(
        'Esa persona ya está vinculada a otra institución. Escribinos y lo resolvemos.',
        'forbidden',
      );
    }

    await database
      .insert(institutionMembers)
      .values({ userId: existing.id, institutionId, role: input.role })
      .onDuplicateKeyUpdate({ set: { role: input.role } });

    await logActivity(database, {
      userId: actorId,
      entityType: 'institution_member',
      entityId: existing.id,
      action: 'create',
      before: null,
      after: { email, institutionId, role: input.role, existingAccount: true },
    });

    return { userId: existing.id, created: false };
  }

  // Rule 4 — created without a password, so it cannot sign in yet.
  const id = await database.transaction(async (tx) => {
    const [inserted] = await tx.insert(users).values({
      email,
      name: input.name,
      passwordHash: null,
      role: input.role,
      institutionId,
      status: 'invited',
      mustChangePassword: true,
    });
    const userId = Number(inserted.insertId);

    await tx.insert(institutionMembers).values({ userId, institutionId, role: input.role });

    await logActivity(tx, {
      userId: actorId,
      entityType: 'institution_member',
      entityId: userId,
      action: 'create',
      before: null,
      after: { email, institutionId, role: input.role, existingAccount: false },
    });

    return userId;
  });

  return { userId: id, created: true };
}

export async function changeMemberRole(
  user: SessionUser | null | undefined,
  targetUserId: number,
  role: MemberRole,
  database: Db = defaultDb,
): Promise<void> {
  const institutionId = requirePanelAdmin(user);
  const actorId = user!.id;

  // An admin demoting themselves would leave the institution with nobody able
  // to manage it, recoverable only by us. Refused rather than warned.
  if (targetUserId === actorId && role !== 'institution_admin') {
    throw new Error(
      'No podés quitarte a vos mismo la administración. Nombrá a otra persona primero.',
    );
  }

  const [membership] = await database
    .select()
    .from(institutionMembers)
    .where(
      and(
        eq(institutionMembers.userId, targetUserId),
        eq(institutionMembers.institutionId, institutionId),
      ),
    )
    .limit(1);
  if (!membership) {
    // Scoped by institution in the WHERE, so "not found" also covers "belongs
    // to another institution" — and answers the same way, on purpose.
    throw new AuthError('Esa persona no es miembro de tu institución.', 'forbidden');
  }

  await database.transaction(async (tx) => {
    await tx
      .update(institutionMembers)
      .set({ role })
      .where(eq(institutionMembers.id, membership.id));

    // `users.role` is the denormalized convenience the session reads at login.
    await tx.update(users).set({ role }).where(eq(users.id, targetUserId));

    await logActivity(tx, {
      userId: actorId,
      entityType: 'institution_member',
      entityId: targetUserId,
      action: 'update',
      before: { role: membership.role },
      after: { role },
    });
  });
}

/**
 * Remove a member.
 *
 * The membership row goes and `users.institution_id` is cleared, which is what
 * takes effect on their next request — sessions carry the scope and live for 8
 * hours (`architecture.md` §7.1), so that is also the bound on how long a
 * removed member's cookie can still work. The `users` row itself stays: it is
 * referenced by `activity_log` and by `verified_by_user_id` on every price they
 * ever verified, and deleting it would orphan the provenance of real data.
 */
export async function removeMember(
  user: SessionUser | null | undefined,
  targetUserId: number,
  database: Db = defaultDb,
): Promise<void> {
  const institutionId = requirePanelAdmin(user);
  const actorId = user!.id;

  if (targetUserId === actorId) {
    throw new Error('No podés quitarte a vos mismo. Pedile a otra persona del equipo que lo haga.');
  }

  const [membership] = await database
    .select()
    .from(institutionMembers)
    .where(
      and(
        eq(institutionMembers.userId, targetUserId),
        eq(institutionMembers.institutionId, institutionId),
      ),
    )
    .limit(1);
  if (!membership) {
    throw new AuthError('Esa persona no es miembro de tu institución.', 'forbidden');
  }

  await database.transaction(async (tx) => {
    await tx.delete(institutionMembers).where(eq(institutionMembers.id, membership.id));
    await tx
      .update(users)
      .set({ institutionId: null, status: 'suspended' })
      .where(and(eq(users.id, targetUserId), eq(users.institutionId, institutionId)));

    await logActivity(tx, {
      userId: actorId,
      entityType: 'institution_member',
      entityId: targetUserId,
      action: 'archive',
      before: { institutionId, role: membership.role },
      after: null,
    });
  });
}
