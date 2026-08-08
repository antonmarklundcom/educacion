/**
 * The claim-your-profile flow, end to end (PR-22). CLAUDE.md rules 4 and 5.
 *
 * Four operations, and the interesting thing about them is which ones are
 * authenticated:
 *
 * | operation      | who                                                       |
 * | -------------- | --------------------------------------------------------- |
 * | `requestClaim` | anybody — it is a public form                              |
 * | `approveClaim` | `admin` only (`requireRole`)                               |
 * | `rejectClaim`  | `admin` only                                               |
 * | `listClaims`   | `editor` and up — reading the queue decides nothing        |
 * | `redeemClaim`  | the holder of a valid token, and nobody else               |
 *
 * `requestClaim` and `redeemClaim` are the two unauthenticated writes in the
 * codebase outside lead capture, so both are written defensively: the request
 * creates a row and sends a mail and grants nothing, and the redemption's very
 * first statement is the conditional `UPDATE` that consumes the token.
 *
 * ### Approval is `admin`, not `editor`
 *
 * `editor` is the data-curation role; it moderates the import queue and edits
 * every table in the country's directory. Approving a claim is not a data
 * decision — it hands a stranger a login and permanent write access to one
 * institution's commercial facts. That is the same class of act as creating a
 * user, so it sits with `admin`. The roles are not a ladder (`roles.ts`), so
 * this is stated rather than derived.
 *
 * ### An already-claimed institution is refused twice
 *
 * Once at request time, so nobody is sent a link that cannot work, and again
 * inside the redemption transaction with
 * `UPDATE institutions … WHERE claimed_by_user_id IS NULL`, which is the check
 * that actually holds: the first one is a race, the second one is a lock. Two
 * links redeemed at the same second cannot both win, and the loser is told the
 * institution is already claimed rather than silently re-assigning it.
 */

import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { claims, institutionMembers, institutions, users } from '@/db/schema';
import { logActivity } from '@/db/queries/admin/activity-log';
import { AuthError, isStaff, requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import { hashPassword, passwordProblem } from '@/lib/auth/password';
import { routeClaim, type ClaimRouteReason } from '@/lib/claims/domain';
import {
  claimExpiry,
  claimTokenState,
  createClaimToken,
  hashClaimToken,
  type ClaimTokenState,
} from '@/lib/claims/token';
import { sendClaimLink, sendClaimRejected } from '@/lib/claims/notify';

/** Pending claims one institution may accumulate before the form stops taking them. */
const MAX_OPEN_CLAIMS_PER_INSTITUTION = 5;

/* -------------------------------------------------------------------------- */
/* Public: requesting a claim                                                  */
/* -------------------------------------------------------------------------- */

export interface ClaimRequestInput {
  institutionSlug: string;
  email: string;
  contactName: string | null;
  note: string | null;
}

export type ClaimRequestOutcome =
  /** Domain verified; the token is in their inbox. */
  | { outcome: 'emailed'; email: string; institutionName: string }
  /** Domain could not be verified; a human decides. No token was sent. */
  | { outcome: 'queued'; email: string; institutionName: string; reason: ClaimRouteReason }
  /** Verified, but the mail did not go out. Nothing to wait for. */
  | { outcome: 'mail_failed'; email: string; institutionName: string }
  | { outcome: 'already_claimed'; institutionName: string }
  | { outcome: 'invalid_email' }
  | { outcome: 'too_many' };

/**
 * Create a claim, and send the token only when the domain check passed.
 *
 * Nothing here is authenticated and nothing here grants anything: the row is a
 * request, and the only thing that turns it into access is a token that went to
 * an address on the institution's own domain, or an admin.
 */
export async function requestClaim(
  input: ClaimRequestInput,
  database: Db = defaultDb,
): Promise<ClaimRequestOutcome> {
  const email = input.email.trim().toLowerCase();

  const [institution] = await database
    .select({
      id: institutions.id,
      nameShort: institutions.nameShort,
      nameOfficial: institutions.nameOfficial,
      website: institutions.website,
      claimedByUserId: institutions.claimedByUserId,
    })
    .from(institutions)
    .where(and(eq(institutions.slug, input.institutionSlug), eq(institutions.status, 'published')))
    .limit(1);

  if (!institution) throw new Error('No encontramos esa institución.');

  const route = routeClaim(email, institution.website);
  if (!route.emailDomain) return { outcome: 'invalid_email' };

  if (institution.claimedByUserId != null) {
    return { outcome: 'already_claimed', institutionName: institution.nameShort };
  }

  // A durable companion to the per-IP limit in the action: a rotating IP still
  // cannot bury the admin queue under one institution.
  const [open] = await database
    .select({ count: sql<number>`count(*)` })
    .from(claims)
    .where(
      and(
        eq(claims.institutionId, institution.id),
        eq(claims.status, 'pending'),
        gt(claims.expiresAt, new Date()),
      ),
    );
  if (Number(open?.count ?? 0) >= MAX_OPEN_CLAIMS_PER_INSTITUTION) {
    return { outcome: 'too_many' };
  }

  const { token, tokenHash } = createClaimToken();
  const expiresAt = claimExpiry();
  const domainVerified = route.route === 'domain';

  const [inserted] = await database.insert(claims).values({
    institutionId: institution.id,
    email,
    emailDomain: route.emailDomain,
    contactName: input.contactName,
    note: input.note,
    domainVerified,
    tokenHash,
    expiresAt,
    status: 'pending',
  });

  if (!domainVerified) {
    // No token leaves the building until a human has said yes.
    return {
      outcome: 'queued',
      email,
      institutionName: institution.nameShort,
      reason: route.reason,
    };
  }

  const sent = await sendClaimLink({
    claimId: Number(inserted.insertId),
    to: email,
    institutionName: institution.nameShort,
    token,
    expiresAt,
  });

  return sent
    ? { outcome: 'emailed', email, institutionName: institution.nameShort }
    : { outcome: 'mail_failed', email, institutionName: institution.nameShort };
}

/* -------------------------------------------------------------------------- */
/* Staff: the review queue                                                     */
/* -------------------------------------------------------------------------- */

export interface ClaimRow {
  id: number;
  institutionId: number;
  institutionName: string;
  institutionSlug: string;
  institutionWebsite: string | null;
  institutionClaimed: boolean;
  email: string;
  emailDomain: string;
  contactName: string | null;
  note: string | null;
  domainVerified: boolean;
  status: (typeof claims.$inferSelect)['status'];
  expiresAt: Date;
  verifiedAt: Date | null;
  decidedByUserId: number | null;
  createdAt: Date;
  /**
   * What the row means right now, expiry included. `expired` is computed and
   * never written: a claim that ran out of time is a fact about the clock, not
   * a decision anybody made, and a cron that flipped rows to a status the code
   * already derives would be a moving part that changes no behaviour.
   */
  state: 'awaiting_review' | 'awaiting_claimant' | 'approved' | 'rejected' | 'expired';
}

const CLAIM_COLUMNS = {
  id: claims.id,
  institutionId: claims.institutionId,
  institutionName: institutions.nameShort,
  institutionSlug: institutions.slug,
  institutionWebsite: institutions.website,
  claimedByUserId: institutions.claimedByUserId,
  email: claims.email,
  emailDomain: claims.emailDomain,
  contactName: claims.contactName,
  note: claims.note,
  domainVerified: claims.domainVerified,
  status: claims.status,
  expiresAt: claims.expiresAt,
  verifiedAt: claims.verifiedAt,
  decidedByUserId: claims.decidedByUserId,
  createdAt: claims.createdAt,
} as const;

type SelectedClaim = Omit<ClaimRow, 'institutionClaimed' | 'state'> & {
  claimedByUserId: number | null;
};

function toClaimRow(row: SelectedClaim): ClaimRow {
  const { claimedByUserId, ...rest } = row;
  return {
    ...rest,
    institutionClaimed: claimedByUserId != null,
    state: claimState(row),
  };
}

function claimState(row: {
  status: ClaimRow['status'];
  expiresAt: Date;
  domainVerified: boolean;
  decidedByUserId: number | null;
}): ClaimRow['state'] {
  if (row.status === 'approved') return 'approved';
  if (row.status === 'rejected') return 'rejected';
  const token = claimTokenState(
    {
      status: 'pending',
      expiresAt: row.expiresAt,
      domainVerified: row.domainVerified,
      decidedByUserId: row.decidedByUserId,
    },
    new Date(),
  );
  if (token === 'expired') return 'expired';
  return token === 'awaiting_review' ? 'awaiting_review' : 'awaiting_claimant';
}

export type ClaimFilter = 'pendientes' | 'aprobados' | 'rechazados' | 'todos';

/** Reading the queue decides nothing, so `editor` is enough. */
export async function listClaims(
  user: SessionUser | null | undefined,
  filter: ClaimFilter = 'pendientes',
  database: Db = defaultDb,
): Promise<ClaimRow[]> {
  requireRole(user, ['editor']);

  const where =
    filter === 'aprobados'
      ? eq(claims.status, 'approved')
      : filter === 'rechazados'
        ? eq(claims.status, 'rejected')
        : filter === 'pendientes'
          ? eq(claims.status, 'pending')
          : undefined;

  const rows = await database
    .select(CLAIM_COLUMNS)
    .from(claims)
    .innerJoin(institutions, eq(institutions.id, claims.institutionId))
    .where(where)
    .orderBy(desc(claims.createdAt))
    .limit(200);

  return rows.map(toClaimRow);
}

export async function getClaim(
  user: SessionUser | null | undefined,
  claimId: number,
  database: Db = defaultDb,
): Promise<ClaimRow | null> {
  requireRole(user, ['editor']);

  const [row] = await database
    .select(CLAIM_COLUMNS)
    .from(claims)
    .innerJoin(institutions, eq(institutions.id, claims.institutionId))
    .where(eq(claims.id, claimId))
    .limit(1);

  return row ? toClaimRow(row) : null;
}

export type ClaimDecisionOutcome = { ok: true; message: string } | { ok: false; error: string };

/**
 * The admin-approval fallback.
 *
 * Approval does not complete the claim — it only makes the token usable, and a
 * **fresh** token is minted and mailed rather than reviving whatever was
 * generated at request time. Two reasons: the original may be days old and its
 * 72 hours nearly spent, and a token that has been sitting in a database column
 * since before anybody looked at the claim should not become live retroactively.
 * The claimant still has to prove they can read the mailbox they named.
 */
export async function approveClaim(
  user: SessionUser | null | undefined,
  claimId: number,
  database: Db = defaultDb,
): Promise<ClaimDecisionOutcome> {
  const actor = requireRole(user, ['admin']);

  const [row] = await database
    .select(CLAIM_COLUMNS)
    .from(claims)
    .innerJoin(institutions, eq(institutions.id, claims.institutionId))
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!row) return { ok: false, error: 'No encontramos esa solicitud.' };
  if (row.status !== 'pending') {
    return { ok: false, error: 'Esa solicitud ya fue resuelta.' };
  }
  if (row.claimedByUserId != null) {
    return {
      ok: false,
      error: 'Esa institución ya fue reclamada. Quitá el reclamo actual antes de aprobar otro.',
    };
  }

  const { token, tokenHash } = createClaimToken();
  const expiresAt = claimExpiry();

  // `WHERE status = 'pending'` so two admins clicking at once mint one token.
  const [result] = await database
    .update(claims)
    .set({ tokenHash, expiresAt, decidedByUserId: actor.id })
    .where(and(eq(claims.id, claimId), eq(claims.status, 'pending')));

  if (result.affectedRows === 0) {
    return { ok: false, error: 'Esa solicitud ya fue resuelta.' };
  }

  await logActivity(database, {
    userId: actor.id,
    entityType: 'claim',
    entityId: claimId,
    action: 'update',
    before: { status: 'pending', decidedByUserId: null },
    after: { decision: 'approved', email: row.email, institutionId: row.institutionId },
  });

  const sent = await sendClaimLink({
    claimId,
    to: row.email,
    institutionName: row.institutionName,
    token,
    expiresAt,
  });

  return {
    ok: true,
    message: sent
      ? `Le enviamos el enlace a ${row.email}. Vence en 72 horas.`
      : `Aprobaste la solicitud pero no pudimos enviar el correo a ${row.email}. ` +
        `Revisá RESEND_API_KEY y volvé a aprobar para reenviar.`,
  };
}

export async function rejectClaim(
  user: SessionUser | null | undefined,
  claimId: number,
  database: Db = defaultDb,
): Promise<ClaimDecisionOutcome> {
  const actor = requireRole(user, ['admin']);

  const [row] = await database
    .select(CLAIM_COLUMNS)
    .from(claims)
    .innerJoin(institutions, eq(institutions.id, claims.institutionId))
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!row) return { ok: false, error: 'No encontramos esa solicitud.' };
  if (row.status !== 'pending') return { ok: false, error: 'Esa solicitud ya fue resuelta.' };

  // Rejection also burns the token: a rejected claim's link must stop working
  // even if the mail already went out on the domain-verified path.
  const [result] = await database
    .update(claims)
    .set({ status: 'rejected', decidedByUserId: actor.id, tokenHash: createClaimToken().tokenHash })
    .where(and(eq(claims.id, claimId), eq(claims.status, 'pending')));

  if (result.affectedRows === 0) return { ok: false, error: 'Esa solicitud ya fue resuelta.' };

  await logActivity(database, {
    userId: actor.id,
    entityType: 'claim',
    entityId: claimId,
    action: 'update',
    before: { status: 'pending' },
    after: { decision: 'rejected', email: row.email, institutionId: row.institutionId },
  });

  await sendClaimRejected({ claimId, to: row.email, institutionName: row.institutionName });

  return { ok: true, message: `Rechazaste la solicitud de ${row.email}.` };
}

/* -------------------------------------------------------------------------- */
/* Redeeming a token                                                           */
/* -------------------------------------------------------------------------- */

export interface ClaimPreview {
  institutionName: string;
  email: string;
  /**
   * False when an account already exists for this address — the claim then
   * attaches the institution to it and **never touches its password**. A claim
   * link is proof of mailbox control, which is enough to create a credential
   * and is not enough to reset one somebody already has.
   */
  needsPassword: boolean;
}

export type ClaimPreviewResult =
  | { ok: true; preview: ClaimPreview }
  | { ok: false; state: ClaimTokenState | 'unknown' | 'already_claimed' };

/**
 * What the redemption page renders. A **read**, deliberately: mail scanners and
 * link previewers fetch URLs out of messages, and a GET that consumed the token
 * would burn every claim link before its owner ever clicked it.
 */
export async function previewClaim(
  token: string,
  database: Db = defaultDb,
): Promise<ClaimPreviewResult> {
  const [row] = await database
    .select({
      status: claims.status,
      email: claims.email,
      expiresAt: claims.expiresAt,
      domainVerified: claims.domainVerified,
      decidedByUserId: claims.decidedByUserId,
      institutionName: institutions.nameShort,
      claimedByUserId: institutions.claimedByUserId,
    })
    .from(claims)
    .innerJoin(institutions, eq(institutions.id, claims.institutionId))
    .where(eq(claims.tokenHash, hashClaimToken(token)))
    .limit(1);

  if (!row) return { ok: false, state: 'unknown' };

  const state = claimTokenState(row);
  if (state !== 'ok') return { ok: false, state };
  if (row.claimedByUserId != null) return { ok: false, state: 'already_claimed' };

  const [existing] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, row.email.toLowerCase()))
    .limit(1);

  return {
    ok: true,
    preview: {
      institutionName: row.institutionName,
      email: row.email,
      needsPassword: existing == null,
    },
  };
}

export type ClaimRedemption =
  | { ok: true; mode: 'created' | 'linked'; institutionName: string; email: string }
  | {
      ok: false;
      reason:
        | ClaimTokenState
        | 'unknown'
        | 'already_claimed'
        | 'staff_email'
        | 'other_institution'
        | 'weak_password';
      message: string;
    };

/**
 * Complete a claim: consume the token, mint or attach the account, mark the
 * institution claimed.
 *
 * ### The order of the writes is the security property
 *
 * Inside one transaction, and in this order:
 *
 * 1. `UPDATE claims SET status='approved' … WHERE id=? AND status='pending'` —
 *    zero affected rows means somebody else redeemed it first, and the
 *    transaction ends there. This is single-use; the pure `claimTokenState`
 *    check above it is a courtesy that races.
 * 2. `UPDATE institutions SET claimed_by_user_id=? WHERE id=? AND
 *    claimed_by_user_id IS NULL` — zero affected rows means the institution was
 *    claimed between the read and now, and the whole transaction rolls back
 *    rather than re-assigning it.
 * 3. Only then the membership row.
 *
 * ### It does not start a session
 *
 * The caller redirects to `/ingresar`. A completed claim mints a **credential**,
 * not a logged-in browser: signing in then happens through the one path that
 * has PR-18's uniform failure message and its timing defence, instead of a
 * second, thinner way to obtain a session that would have to be kept correct
 * forever. The cost is one extra form for the claimant; the benefit is that
 * this file cannot become an alternative login.
 */
export async function redeemClaim(
  token: string,
  input: { password: string; name: string | null },
  database: Db = defaultDb,
): Promise<ClaimRedemption> {
  const tokenHash = hashClaimToken(token);

  const [row] = await database
    .select({
      id: claims.id,
      institutionId: claims.institutionId,
      email: claims.email,
      status: claims.status,
      expiresAt: claims.expiresAt,
      domainVerified: claims.domainVerified,
      decidedByUserId: claims.decidedByUserId,
      institutionName: institutions.nameShort,
      claimedByUserId: institutions.claimedByUserId,
    })
    .from(claims)
    .innerJoin(institutions, eq(institutions.id, claims.institutionId))
    .where(eq(claims.tokenHash, tokenHash))
    .limit(1);

  // Every failure below returns before any write. A dead link must not leave a
  // trace in the database that a prober could time or count.
  if (!row) {
    return { ok: false, reason: 'unknown', message: 'Ese enlace no es válido.' };
  }

  const state = claimTokenState(row);
  if (state === 'used') {
    return { ok: false, reason: 'used', message: 'Ese enlace ya fue usado.' };
  }
  if (state === 'expired') {
    return {
      ok: false,
      reason: 'expired',
      message: 'Ese enlace venció. Pedí el reclamo de nuevo desde el perfil de tu institución.',
    };
  }
  if (state === 'awaiting_review') {
    return {
      ok: false,
      reason: 'awaiting_review',
      message: 'Esa solicitud todavía está en revisión.',
    };
  }
  if (row.claimedByUserId != null) {
    return {
      ok: false,
      reason: 'already_claimed',
      message: 'Esa institución ya fue reclamada. Escribinos y lo revisamos.',
    };
  }

  const email = row.email.toLowerCase();
  const [existing] = await database
    .select({ id: users.id, role: users.role, institutionId: users.institutionId })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);

  if (existing && isStaff({ role: existing.role })) {
    // The same refusal `inviteMember` makes: a staff account is never attached
    // to an institution through a self-service path.
    return {
      ok: false,
      reason: 'staff_email',
      message: 'Esa dirección pertenece a una cuenta del equipo. Escribinos y lo vinculamos.',
    };
  }

  if (existing) {
    const [otherMembership] = await database
      .select({ institutionId: institutionMembers.institutionId })
      .from(institutionMembers)
      .where(
        and(
          eq(institutionMembers.userId, existing.id),
          ne(institutionMembers.institutionId, row.institutionId),
        ),
      )
      .limit(1);

    if (
      otherMembership ||
      (existing.institutionId != null && existing.institutionId !== row.institutionId)
    ) {
      // `architecture.md` §7.1 scopes a two-institution user to neither, so
      // attaching a second one would lock them out of the first.
      return {
        ok: false,
        reason: 'other_institution',
        message: 'Esa persona ya está vinculada a otra institución. Escribinos y lo resolvemos.',
      };
    }
  }

  let passwordHash: string | null = null;
  if (!existing) {
    const problem = passwordProblem(input.password);
    if (problem) return { ok: false, reason: 'weak_password', message: problem };
    passwordHash = await hashPassword(input.password);
  }

  try {
    const mode = await database.transaction(async (tx) => {
      // 1. Consume the token. This is the single-use guarantee.
      const [consumed] = await tx
        .update(claims)
        .set({ status: 'approved', verifiedAt: new Date() })
        .where(and(eq(claims.id, row.id), eq(claims.status, 'pending')));
      if (consumed.affectedRows === 0) throw new RaceLost('used');

      let userId: number;
      let created: boolean;

      if (existing) {
        userId = existing.id;
        created = false;
        await tx
          .update(users)
          .set({ institutionId: row.institutionId, role: 'institution_admin', status: 'active' })
          .where(eq(users.id, existing.id));
      } else {
        const [inserted] = await tx.insert(users).values({
          email,
          name: input.name,
          passwordHash,
          role: 'institution_admin',
          institutionId: row.institutionId,
          status: 'active',
          mustChangePassword: false,
        });
        userId = Number(inserted.insertId);
        created = true;
      }

      // 2. Take the institution, but only if it is still free.
      const [taken] = await tx
        .update(institutions)
        .set({ claimedByUserId: userId })
        .where(and(eq(institutions.id, row.institutionId), isNull(institutions.claimedByUserId)));
      if (taken.affectedRows === 0) throw new RaceLost('already_claimed');

      // 3. The membership `panelInstitutionId` resolves the session from.
      await tx
        .insert(institutionMembers)
        .values({
          userId,
          institutionId: row.institutionId,
          role: 'institution_admin',
        })
        .onDuplicateKeyUpdate({ set: { role: 'institution_admin' } });

      await tx.update(claims).set({ userId }).where(eq(claims.id, row.id));

      await logActivity(tx, {
        userId,
        entityType: 'claim',
        entityId: row.id,
        action: 'update',
        before: { status: 'pending' },
        after: {
          decision: 'redeemed',
          institutionId: row.institutionId,
          accountCreated: created,
          domainVerified: row.domainVerified,
        },
      });

      return created ? ('created' as const) : ('linked' as const);
    });

    return { ok: true, mode, institutionName: row.institutionName, email };
  } catch (error) {
    if (error instanceof RaceLost) {
      return error.reason === 'used'
        ? { ok: false, reason: 'used', message: 'Ese enlace ya fue usado.' }
        : {
            ok: false,
            reason: 'already_claimed',
            message: 'Esa institución ya fue reclamada. Escribinos y lo revisamos.',
          };
    }
    throw error;
  }
}

/** Thrown inside the transaction to roll it back with a reason. */
class RaceLost extends Error {
  constructor(readonly reason: 'used' | 'already_claimed') {
    super(reason);
    this.name = 'RaceLost';
  }
}

/* -------------------------------------------------------------------------- */
/* The read PR-23 and PR-25 build against                                      */
/* -------------------------------------------------------------------------- */

export interface InstitutionClaimState {
  claimed: boolean;
  claimedByUserId: number | null;
  claimedAt: Date | null;
}

/**
 * Is this institution claimed, and by whom?
 *
 * PR-25 gates plan activation on it (an unclaimed institution has nobody to
 * bill or to hand a panel to), and the public profile uses the boolean to
 * decide whether to render the "¿Es tu institución?" CTA. It is a read of
 * `institutions.claimed_by_user_id` plus the approved claim that set it — the
 * claim row is the provenance of the flag, not a second source of truth for it.
 */
export async function getInstitutionClaimState(
  institutionId: number,
  database: Db = defaultDb,
): Promise<InstitutionClaimState> {
  const [row] = await database
    .select({ claimedByUserId: institutions.claimedByUserId })
    .from(institutions)
    .where(eq(institutions.id, institutionId))
    .limit(1);

  if (!row?.claimedByUserId) return { claimed: false, claimedByUserId: null, claimedAt: null };

  const [claim] = await database
    .select({ verifiedAt: claims.verifiedAt })
    .from(claims)
    .where(and(eq(claims.institutionId, institutionId), eq(claims.status, 'approved')))
    .orderBy(desc(claims.verifiedAt))
    .limit(1);

  return {
    claimed: true,
    claimedByUserId: row.claimedByUserId,
    claimedAt: claim?.verifiedAt ?? null,
  };
}

/** Guard for a caller that must not act on an unclaimed institution. */
export function assertClaimed(state: InstitutionClaimState): void {
  if (!state.claimed) {
    throw new AuthError('Esa institución todavía no fue reclamada.', 'forbidden');
  }
}
