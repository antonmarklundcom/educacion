import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable, StatusBadge, type AdminColumn } from '@/components/admin/AdminTable';
import { Button } from '@/components/ui';
import { listJobsAdmin, type AdminJobRow } from '@/db/queries/admin/jobs';
import { DEFAULT_TTL_DAYS } from '@/db/queries/jobs';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminJobsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const params = await searchParams;
  const rawPage = params.page;
  const page = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage) || 1;

  const { rows, total, pageSize } = await listJobsAdmin(user, { page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns: AdminColumn<AdminJobRow>[] = [
    { header: 'Aviso', cell: (row) => row.title },
    { header: 'Empresa', cell: (row) => row.employerName },
    { header: 'Carrera', cell: (row) => row.careerName },
    { header: 'Publicado', numeric: true, cell: (row) => row.postedOn },
    { header: 'Vence', numeric: true, cell: (row) => row.expiresOn ?? `+${DEFAULT_TTL_DAYS} días` },
    { header: 'Estado', cell: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-bold">Empleos relacionados</h1>
          <p className="text-muted max-w-prose text-sm">
            No somos una bolsa de trabajo: son unos pocos avisos reales por carrera, con su fecha y
            su fuente, que sostienen la página de salida laboral y llevan a trabajo.com.py. Un aviso
            sin fecha o sin fuente no se puede cargar.
          </p>
        </div>
        <Button href="/admin/empleos/nuevo">Cargá un aviso</Button>
      </div>

      <AdminTable
        columns={columns}
        rows={rows}
        editHref={(row) => `/admin/empleos/${row.id}`}
        emptyLabel="Todavía no hay ningún aviso cargado."
        page={page}
        totalPages={totalPages}
        buildPageHref={(next) => `/admin/empleos?page=${next}`}
      />
    </main>
  );
}
