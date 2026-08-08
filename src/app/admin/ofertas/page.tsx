import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable, StatusBadge } from '@/components/admin/AdminTable';
import { Button } from '@/components/ui';
import { listOfferingsAdmin } from '@/db/queries/admin/offerings';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';
import { formatDurationMonths } from '@/lib/format';
import { MODALITY_LABELS, SHIFT_LABELS } from '@/lib/search/labels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminOfferingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const params = await searchParams;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const { rows, total, pageSize } = await listOfferingsAdmin(user, { page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-ink text-2xl font-bold">Ofertas</h1>
        <Button href="/admin/ofertas/nueva">Agregá una oferta</Button>
      </div>

      <AdminTable
        rows={rows}
        emptyLabel="Todavía no hay ofertas cargadas."
        editHref={(row) => `/admin/ofertas/${row.id}`}
        page={page}
        totalPages={totalPages}
        buildPageHref={(p) => `/admin/ofertas?page=${p}`}
        columns={[
          { header: 'Programa', cell: (row) => row.programName },
          { header: 'Institución', cell: (row) => row.institutionName },
          { header: 'Sede', cell: (row) => row.campusName },
          { header: 'Modalidad', cell: (row) => MODALITY_LABELS[row.modality] },
          { header: 'Turno', cell: (row) => SHIFT_LABELS[row.shift] },
          {
            header: 'Duración',
            cell: (row) =>
              row.durationMonths ? formatDurationMonths(row.durationMonths) : 'Sin datos',
          },
          { header: 'Estado', cell: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </main>
  );
}
