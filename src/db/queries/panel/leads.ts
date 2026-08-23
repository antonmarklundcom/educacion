/**
 * `/panel/leads` — inbox, status transitions and CSV export (PR-23). Rule 5.
 *
 * ### Free-plan gating
 *
 * `architecture.md` §6.3 fixed `LeadRecord` with contact fields on it, so this
 * module is where "free-plan institutions see counts but not contact details"
 * (`pr-plan.md` PR-23) actually happens: `contactVisible` is one call to
 * `getEntitlements(institutionId)` — PR-25 made `src/lib/entitlements` the
 * single source of truth, so this no longer reads a plan pointer of its own —
 * and every row-shaping function nulls `name` / `phoneE164` / `email` /
 * `message` when the `lead_contacts` feature is off. The redaction happens
 * **here**, not in a component — `/panel/leads/export` renders no JSX and
 * would otherwise be a second place the rule could be forgotten.
 *
 * **What is deliberately *not* gated: the delivery email.** The lead's consent
 * text says in so many words that their data is sent to the institution they
 * chose (`risks.md` §R-06), so withholding it from a free institution would
 * make our own consent text false. What a plan buys is the inbox — the contact
 * details in `/panel`, the export and the status workflow — not whether the
 * student's request reaches anyone. `monetization.md` §7 records the decision.
 *
 * ### Why this is a second module rather than new parameters on `leads.ts`
 *
 * `src/db/queries/leads.ts` is the interface PR-14 fixed for PR-23 and PR-28
 * to build against (`architecture.md` §6.3) — `LeadRecord` carries every
 * contact field because the lead-delivery path always needs them. Redaction is
 * a panel-only, plan-only concern, so it lives on top of that interface
 * instead of inside it.
 */

import { eq, inArray } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { offerings, programs } from '@/db/schema';
import {
  countLeadsForInstitution,
  countOverdueLeadsForInstitution,
  getLeadById,
  listLeadsForInstitution,
  updateLeadStatus,
  type LeadRecord,
} from '@/db/queries/leads';
import { logActivity } from '@/db/queries/admin/activity-log';
import { AuthError } from '@/lib/auth/roles';
import { can, getEntitlements } from '@/lib/entitlements';
import type { SessionUser } from '@/lib/auth/session';
import { PANEL_LEAD_STATUSES, type LeadStatus, type PanelLeadStatus } from '@/lib/leads/contract';

import { assertOwnsLead, panelInstitutionId } from './scope';

export { PANEL_LEAD_STATUSES, type PanelLeadStatus };

const PAGE_SIZE = 25;

export interface PanelLeadRow {
  id: number;
  offeringId: number | null;
  programName: string | null;
  status: LeadStatus;
  ageBracket: LeadRecord['ageBracket'];
  createdAt: Date;
  deliveredAt: Date | null;
  sourcePage: string | null;
  /** Null exactly when `contactVisible` is false on the enclosing result. */
  name: string | null;
  phoneE164: string | null;
  email: string | null;
  message: string | null;
}

export interface PanelLeadsPage {
  rows: PanelLeadRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Whether this institution's plan includes contact details. */
  contactVisible: boolean;
  /**
   * Leads of **this institution** — not of this page, and not of the selected
   * tab — sitting in `new` past the 48 h SLA (PR-49). The banner says how many
   * are late overall; filtering to "Descartadas" must not make the number look
   * like zero.
   */
  overdueCount: number;
}

/**
 * No counting subscription resolves to the free baseline, whose `lead_contacts`
 * is false — an institution is never accidentally treated as paid because a row
 * is missing, and a subscription that ended yesterday stops counting today
 * without anything having to run.
 */
async function institutionContactVisible(institutionId: number, database: Db): Promise<boolean> {
  return can(await getEntitlements(institutionId, undefined, database), 'lead_contacts');
}

async function programNamesByOfferingIds(
  offeringIds: number[],
  database: Db,
): Promise<Map<number, string>> {
  if (offeringIds.length === 0) return new Map();
  const rows = await database
    .select({ offeringId: offerings.id, programName: programs.nameOfficial })
    .from(offerings)
    .innerJoin(programs, eq(programs.id, offerings.programId))
    .where(inArray(offerings.id, offeringIds));
  return new Map(rows.map((row) => [row.offeringId, row.programName]));
}

function shapeRow(
  record: LeadRecord,
  programName: string | null,
  contactVisible: boolean,
): PanelLeadRow {
  return {
    id: record.id,
    offeringId: record.offeringId,
    programName,
    status: record.status,
    ageBracket: record.ageBracket,
    createdAt: record.createdAt,
    deliveredAt: record.deliveredAt,
    sourcePage: record.sourcePage,
    name: contactVisible ? record.name : null,
    phoneE164: contactVisible ? record.phoneE164 : null,
    email: contactVisible ? record.email : null,
    message: contactVisible ? record.message : null,
  };
}

export async function listPanelLeads(
  user: SessionUser | null | undefined,
  options: { status?: LeadStatus; page?: number; now?: Date } = {},
  database: Db = defaultDb,
): Promise<PanelLeadsPage> {
  const institutionId = panelInstitutionId(user);
  const page = Math.max(1, options.page ?? 1);

  const [contactVisible, records, total, overdueCount] = await Promise.all([
    institutionContactVisible(institutionId, database),
    listLeadsForInstitution(
      {
        institutionId,
        status: options.status,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      },
      database,
    ),
    countLeadsForInstitution(institutionId, options.status, database),
    countOverdueLeadsForInstitution(institutionId, options.now ?? new Date(), database),
  ]);

  const offeringIds = [
    ...new Set(records.map((r) => r.offeringId).filter((id): id is number => id != null)),
  ];
  const names = await programNamesByOfferingIds(offeringIds, database);

  return {
    rows: records.map((record) =>
      shapeRow(
        record,
        record.offeringId != null ? (names.get(record.offeringId) ?? null) : null,
        contactVisible,
      ),
    ),
    total,
    page,
    pageSize: PAGE_SIZE,
    contactVisible,
    overdueCount,
  };
}

export async function getPanelLead(
  user: SessionUser | null | undefined,
  leadId: number,
  database: Db = defaultDb,
): Promise<PanelLeadRow | null> {
  const institutionId = await assertOwnsLead(user, leadId, database);

  const record = await getLeadById(leadId, database);
  if (!record) return null;

  const [contactVisible, names] = await Promise.all([
    institutionContactVisible(institutionId, database),
    record.offeringId != null
      ? programNamesByOfferingIds([record.offeringId], database)
      : Promise.resolve(new Map<number, string>()),
  ]);

  return shapeRow(
    record,
    record.offeringId != null ? (names.get(record.offeringId) ?? null) : null,
    contactVisible,
  );
}

/**
 * `contacted` / `qualified` / `discarded` only — `new` and `sent` are system
 * states an institution never sets directly (`leads.ts`'s docstring on
 * `updateLeadStatus`).
 */
export async function setPanelLeadStatus(
  user: SessionUser | null | undefined,
  leadId: number,
  status: string,
  database: Db = defaultDb,
): Promise<void> {
  await assertOwnsLead(user, leadId, database);
  const actorId = user!.id;

  if (!(PANEL_LEAD_STATUSES as readonly string[]).includes(status)) {
    throw new AuthError('Ese estado no se puede asignar desde el panel.', 'forbidden');
  }

  await updateLeadStatus(leadId, status as PanelLeadStatus, database);

  await logActivity(database, {
    userId: actorId,
    entityType: 'lead',
    entityId: leadId,
    action: 'update',
    before: null,
    after: { status },
  });
}

export interface PanelLeadExportRow extends PanelLeadRow {
  consentAt: Date;
}

/** Every lead this institution has, for the CSV export. No pagination — the whole set, redacted the same way the list is. */
export async function listPanelLeadsForExport(
  user: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<{ rows: PanelLeadExportRow[]; contactVisible: boolean }> {
  const institutionId = panelInstitutionId(user);

  const [contactVisible, records] = await Promise.all([
    institutionContactVisible(institutionId, database),
    listLeadsForInstitution({ institutionId, limit: 100_000 }, database),
  ]);

  const offeringIds = [
    ...new Set(records.map((r) => r.offeringId).filter((id): id is number => id != null)),
  ];
  const names = await programNamesByOfferingIds(offeringIds, database);

  const rows = records.map((record) => ({
    ...shapeRow(
      record,
      record.offeringId != null ? (names.get(record.offeringId) ?? null) : null,
      contactVisible,
    ),
    consentAt: record.consentAt,
  }));

  return { rows, contactVisible };
}
