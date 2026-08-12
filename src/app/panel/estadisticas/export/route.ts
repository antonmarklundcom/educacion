import { NextResponse } from 'next/server';

import { panelMonthlyReport } from '@/db/queries/panel/analytics';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';
import { reportToCsv } from '@/lib/panel/report-csv';

export const dynamic = 'force-dynamic';

/**
 * `GET /panel/estadisticas/export?mes=YYYY-MM` — the monthly report as CSV.
 *
 * A route handler, because the deliverable is a file. It performs **no** check
 * of its own: `panelMonthlyReport` scopes through `panelInstitutionId` and
 * asserts the `monthly_report` entitlement, and it is the single function the
 * printable page reads too — a check written here would leave that one open,
 * and two checks would be two places to forget one (CLAUDE.md rule 4).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await currentUser();
  const month = new URL(request.url).searchParams.get('mes') ?? '';

  let report;
  try {
    report = await panelMonthlyReport(user, month);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.reason === 'unauthenticated' ? 401 : 403 },
      );
    }
    throw error;
  }

  return new NextResponse(reportToCsv(report), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="educacion-${report.month}.csv"`,
    },
  });
}
