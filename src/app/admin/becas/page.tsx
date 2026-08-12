import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable, StatusBadge, type AdminColumn } from '@/components/admin/AdminTable';
import { Badge, Button } from '@/components/ui';
import { listBecasAdmin, type BecaRow } from '@/db/queries/admin/becas';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { BECA_TYPE_LABELS } from './fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Every beca, including the ones whose deadline has passed — the public list
 * hides those by date, and you cannot re-verify what you cannot see (the same
 * argument `/admin/aranceles` makes for a stale price).
 */
export default async function AdminBecasPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const params = await searchParams;
  const rawPage = params.page;
  const page = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage) || 1;
  const today = new Date().toISOString().slice(0, 10);

  const { rows, total, pageSize } = await listBecasAdmin(user, { page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns: AdminColumn<BecaRow>[] = [
    { header: 'Título', cell: (row) => row.title },
    { header: 'Tipo', cell: (row) => BECA_TYPE_LABELS[row.type] },
    { header: 'Cierra', numeric: true, cell: (row) => row.deadline ?? 'permanente' },
    {
      header: 'Visible',
      cell: (row) =>
        row.deadline != null && row.deadline < today ? (
          <Badge tone="neutral">Cerrada</Badge>
        ) : (
          <StatusBadge status={row.status} />
        ),
    },
  ];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-bold">Becas</h1>
          <p className="text-muted max-w-prose text-sm">
            Toda beca necesita una fuente: publicamos solo lo que podemos mostrar de dónde salió.
            Las que ya cerraron dejan de listarse solas, sin que nadie las archive.
          </p>
        </div>
        <Button href="/admin/becas/nueva">Cargá una beca</Button>
      </div>

      <AdminTable
        columns={columns}
        rows={rows}
        editHref={(row) => `/admin/becas/${row.id}`}
        emptyLabel="Todavía no hay ninguna beca cargada."
        page={page}
        totalPages={totalPages}
        buildPageHref={(next) => `/admin/becas?page=${next}`}
      />
    </main>
  );
}
