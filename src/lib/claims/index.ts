/**
 * The claim flow's public surface (PR-22).
 *
 * ### What PR-23 and PR-25 build against
 *
 * The short version, and the point of this file: **downstream PRs do not import
 * the claim flow at all.** A completed claim leaves the database in exactly the
 * state PR-18 and PR-21 already understand, so the lead inbox and the
 * entitlements layer keep using the interfaces they already have:
 *
 * - `institutions.claimed_by_user_id` is set to the claimant.
 * - `users` holds an `institution_admin` with `institution_id` set and a
 *   password they chose (or, when the address already had an account, that
 *   account, untouched except for the attachment).
 * - `institution_members` holds exactly one `institution_admin` row for the
 *   pair, which is what `resolveInstitutionScope` reads at login and what
 *   `panelInstitutionId(user)` then returns.
 *
 * So `/panel/leads` (PR-23) scopes with `panelInstitutionId` as every other
 * panel route does, and needs no claim-specific branch. The claim flow is a way
 * for a member row to come into existence; it is never a second way to
 * authorize one.
 *
 * The one thing PR-25 genuinely needs is the question "is this institution
 * claimed, and since when" — a plan cannot be activated for an institution with
 * nobody to hand it to — and that is `getInstitutionClaimState`, plus
 * `assertClaimed` for the guard form. Both are stable for those PRs.
 *
 * PR-24 (dispute) needs nothing from here either: a dispute is raised from
 * inside `/panel`, so it is already behind the same scope check.
 */

export {
  approveClaim,
  assertClaimed,
  getClaim,
  getInstitutionClaimState,
  listClaims,
  previewClaim,
  redeemClaim,
  rejectClaim,
  requestClaim,
  type ClaimFilter,
  type ClaimPreview,
  type ClaimPreviewResult,
  type ClaimRedemption,
  type ClaimRequestInput,
  type ClaimRequestOutcome,
  type ClaimRow,
  type InstitutionClaimState,
} from '@/db/queries/claims';

export {
  ROUTE_EXPLANATION,
  domainsMatch,
  emailDomain,
  routeClaim,
  websiteDomain,
  type ClaimRoute,
  type ClaimRouteReason,
} from './domain';

export { CLAIM_TTL_HOURS, claimTokenState, type ClaimTokenState } from './token';
