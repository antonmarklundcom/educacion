/**
 * All SQL for `events` (CLAUDE.md rule 5).
 *
 * This table is the one that lets an institution be told "tuviste 1.240 vistas
 * y 87 clics a WhatsApp este mes" with a number we can defend, which GA4 cannot
 * produce per institution (`data-model.md`). PR-28 aggregates over it; PR-14
 * only writes `whatsapp_click` and `lead_submit`, and PR-17 adds the rest of
 * the event types and the `/admin/stats` read.
 *
 * **There is no PII column here and there must never be one.** The row is a
 * type, two foreign keys and a session hash that is a salted, daily-rotating
 * digest — see `lib/privacy/hash`. Nothing in it identifies a person, which is
 * also why writing one is not gated on the cookie banner: there is no cookie
 * and no client-side storage involved.
 */

import { db as defaultDb, type Db } from '@/db';
import { events } from '@/db/schema';
import type { EVENT_TYPE } from '@/db/schema';

export type EventType = (typeof EVENT_TYPE)[number];

export interface EventInsert {
  type: EventType;
  offeringId: number | null;
  institutionId: number | null;
  sessionHash: string | null;
}

export async function insertEvent(input: EventInsert, database: Db = defaultDb): Promise<void> {
  await database.insert(events).values(input);
}
