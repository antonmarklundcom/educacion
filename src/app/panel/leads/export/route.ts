import { NextResponse } from 'next/server';

import { listPanelLeadsForExport } from '@/db/queries/panel/leads';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';
import { leadsToCsv } from '@/lib/panel/leads-csv';

export const dynamic = 'force-dynamic';

/**
 * `GET /panel/leads/export` — the whole CSV export (`pr-plan.md` PR-23's
 * acceptance criterion: "export contains only that institution's leads").
 *
 * A route handler rather than a server action because the deliverable is a
 * file, not a form result. `listPanelLeadsForExport` scopes through
 * `panelInstitutionId` and applies the same free-plan redaction the inbox
 * uses — this route renders no JSX, so there is nothing else guarding contact
 * details here except that function.
 */
export async function GET(): Promise<NextResponse> {
  const user = await currentUser();

  let data;
  try {
    data = await listPanelLeadsForExport(user);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  return new NextResponse(leadsToCsv(data.rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="solicitudes.csv"',
    },
  });
}
