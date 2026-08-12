/**
 * Data-integrity invariants that every write path must go through.
 *
 * These are not "validation" in the form-library sense. They are the rules
 * from `plan.md` §2 and `docs/risks.md` §R-09 that make the difference between
 * a defensible claim and a defamatory one, and they are enforced in three
 * places on purpose:
 *
 *   1. here, in code, on every write (importer, admin CRUD, institution panel)
 *   2. as MySQL CHECK constraints in the schema, so a stray SQL write fails too
 *   3. in `invariants.test.ts`
 *
 * The database check is the backstop. This module is the one that produces an
 * error message a human can act on.
 */

import { ACCREDITATION_STATUS, ACCREDITATION_SCOPE } from './schema';

export class InvariantError extends Error {
  constructor(
    message: string,
    readonly rule: string,
  ) {
    super(message);
    this.name = 'InvariantError';
  }
}

/* -------------------------------------------------------------------------- */
/* Accreditation citation rule                                                */
/* -------------------------------------------------------------------------- */

export type AccreditationStatus = (typeof ACCREDITATION_STATUS)[number];
export type AccreditationScope = (typeof ACCREDITATION_SCOPE)[number];

/** Statuses that assert something positive and therefore require a citation. */
export const CITATION_REQUIRED_STATUSES = [
  'vigente',
  'en_proceso',
] as const satisfies readonly AccreditationStatus[];

export interface AccreditationCitationInput {
  status: AccreditationStatus;
  sourceUrl?: string | null;
  resolutionNumber?: string | null;
}

function present(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function hasRequiredCitation(row: AccreditationCitationInput): boolean {
  if (!(CITATION_REQUIRED_STATUSES as readonly string[]).includes(row.status)) return true;
  return present(row.sourceUrl) || present(row.resolutionNumber);
}

/**
 * Throws unless a positive accreditation status carries a citation.
 *
 * No citation, no badge. An uncited "vigente" is a claim we cannot defend to
 * the institution it describes, and an uncited "no_acreditada" is worse — see
 * `assertAccreditationStatusIsSafe`.
 */
export function assertAccreditationCitation(row: AccreditationCitationInput): void {
  if (!hasRequiredCitation(row)) {
    throw new InvariantError(
      `An accreditation with status '${row.status}' requires source_url or resolution_number.`,
      'accreditations_citation_required',
    );
  }
}

/**
 * Unknown is `sin_datos`, never `no_acreditada`.
 *
 * Asserting a negative we have not verified is the legally dangerous case, so
 * `no_acreditada` is only writable with an explicit citation — the same bar as
 * a positive claim.
 */
export function assertAccreditationStatusIsSafe(row: AccreditationCitationInput): void {
  assertAccreditationCitation(row);
  if (row.status === 'no_acreditada' && !present(row.sourceUrl) && !present(row.resolutionNumber)) {
    throw new InvariantError(
      "'no_acreditada' asserts a negative and requires a source. Use 'sin_datos' when unknown.",
      'accreditations_negative_requires_source',
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Polymorphic scope rule                                                     */
/* -------------------------------------------------------------------------- */

export interface ScopedRowInput {
  scope: AccreditationScope;
  institutionId?: number | null;
  programId?: number | null;
  offeringId?: number | null;
}

/**
 * `accreditations` and `admissions` attach to exactly one of institution /
 * program / offering. Mirrors the `*_scope_target` CHECK constraints.
 */
export function assertScopeTarget(row: ScopedRowInput, table: string): void {
  const expected: Record<AccreditationScope, keyof ScopedRowInput> = {
    institution: 'institutionId',
    program: 'programId',
    offering: 'offeringId',
  };
  const required = expected[row.scope];
  if (row[required] == null) {
    throw new InvariantError(
      `${table}.scope = '${row.scope}' requires ${String(required)} to be set.`,
      `${table}_scope_target`,
    );
  }
  if (row.scope === 'institution' && (row.programId != null || row.offeringId != null)) {
    throw new InvariantError(
      `${table}.scope = 'institution' must not also set program_id or offering_id.`,
      `${table}_scope_target`,
    );
  }
  if (row.scope === 'program' && row.offeringId != null) {
    throw new InvariantError(
      `${table}.scope = 'program' must not also set offering_id.`,
      `${table}_scope_target`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Price rules                                                                */
/* -------------------------------------------------------------------------- */

/** An arancel older than this is not displayed anywhere. Not negotiable. */
export const PRICE_MAX_AGE_MONTHS = 12;

export interface PriceInput {
  isFree?: boolean;
  matricula?: number | null;
  monthlyFee?: number | null;
  installmentsPerYear?: number | null;
  admissionFee?: number | null;
}

/**
 * The comparador's canonical number: matrícula + cuota × cuotas/año.
 *
 * Returns `null`, never 0, when the figure cannot be computed honestly.
 * `null` means "sin datos"; `0` means "gratuita". Collapsing the two would
 * make a university with no captured price look free.
 *
 * Must stay identical to the `annual_cost` generated column in `schema.ts`.
 */
export function computeAnnualCost(price: PriceInput): number | null {
  if (price.isFree) return 0;
  if (price.monthlyFee != null && price.installmentsPerYear == null) return null;
  if (price.matricula == null && price.monthlyFee == null) return null;
  return (price.matricula ?? 0) + (price.monthlyFee ?? 0) * (price.installmentsPerYear ?? 0);
}

export function assertPriceIsCoherent(price: PriceInput): void {
  if (price.isFree && (price.matricula != null || price.monthlyFee != null)) {
    throw new InvariantError(
      'A price marked is_free must not carry a matrícula or a cuota (an admission fee is allowed).',
      'prices_free_has_no_fees',
    );
  }
  const n = price.installmentsPerYear;
  if (n != null && (n < 1 || n > 24)) {
    throw new InvariantError(
      `installments_per_year must be between 1 and 24, got ${n}.`,
      'prices_installments_range',
    );
  }
  for (const [field, value] of Object.entries({
    matricula: price.matricula,
    monthlyFee: price.monthlyFee,
    admissionFee: price.admissionFee,
  })) {
    if (value != null && value < 0) {
      throw new InvariantError(`${field} must not be negative.`, 'prices_non_negative');
    }
    if (value != null && !Number.isInteger(value)) {
      throw new InvariantError(
        `${field} must be an integer in the base currency unit, got ${value}.`,
        'money_is_integer',
      );
    }
  }
}

/**
 * The date a price stops being *fresh* — `verified_at + 12 months`.
 *
 * **This used to be the date it stopped being shown** (CLAUDE.md rule 3, in its
 * original form). PR-33 changed the policy: a stale arancel is now displayed
 * everywhere it used to be hidden, carrying a visible "dato desactualizado" and
 * the date we last verified it. The column and this function keep their names
 * because what they compute did not change — only what the site does with it.
 */
export function priceExpiresOn(verifiedAt: Date | null | undefined): Date | null {
  if (!verifiedAt) return null;
  const expiry = new Date(verifiedAt.getTime());
  expiry.setUTCMonth(expiry.getUTCMonth() + PRICE_MAX_AGE_MONTHS);
  return expiry;
}

/**
 * How old an arancel is, in the only three states the UI distinguishes.
 *
 * ### The policy this replaced, and why it changed (PR-33)
 *
 * Until now an arancel older than 12 months was **hidden**: the amounts were
 * nulled before they reached a component, and the page said "Consultá el
 * arancel". The reasoning was that a wrong number is worse than no number.
 *
 * What that produced in practice is a directory that shows nothing for most
 * carreras — arancel data decays annually and re-verification is manual
 * (`plan.md` §6) — and a student who then finds the same old number on the
 * university's own site, uncontradicted and unlabelled. Hiding did not protect
 * anybody; it removed our chance to say "this is from 2024".
 *
 * So the number is shown **with its date and a visible warning**. The rule that
 * did not change: we never present a stale number as current, and we never
 * invent one.
 *
 * `unknown` is its own state rather than being folded into `stale`: a price
 * with no `verified_at` at all cannot be dated on the page, and "no sabemos
 * cuándo se actualizó" is a different sentence from "es de marzo de 2024".
 */
export type PriceFreshness = 'fresh' | 'stale' | 'unknown';

export function priceFreshness(
  verifiedAt: Date | null | undefined,
  now: Date = new Date(),
): PriceFreshness {
  if (!verifiedAt) return 'unknown';
  const expiry = priceExpiresOn(verifiedAt);
  return expiry != null && expiry.getTime() > now.getTime() ? 'fresh' : 'stale';
}

/** True when the UI must warn about the age of this number. */
export function needsFreshnessWarning(
  verifiedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return priceFreshness(verifiedAt, now) !== 'fresh';
}
