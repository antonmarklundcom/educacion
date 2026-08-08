import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable, StatusBadge } from '@/components/admin/AdminTable';
import { Button, Input } from '@/components/ui';
import { listCampusesAdmin } from '@/db/queries/admin/campuses';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminCampusesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : '';
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const { rows, total, pageSize } = await listCampusesAdmin(user, { q, page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Sedes</h1>
        <Button href="/admin/sedes/nueva">Agregá una sede</Button>
      </div>

      <form method="GET" className="flex max-w-sm gap-2">
        <Input
          type="search"
          name="q"
          placeholder="Buscar por nombre…"
          defaultValue={q}
          aria-label="Buscar sede"
        />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <AdminTable
        rows={rows}
        emptyLabel={q ? 'Ninguna sede coincide con esa búsqueda.' : 'Todavía no hay sedes cargadas.'}
        editHref={(row) => `/admin/sedes/${row.id}`}
        page={page}
        totalPages={totalPages}
        buildPageHref={(p) => `/admin/sedes?${q ? `q=${encodeURIComponent(q)}&` : ''}page=${p}`}
        columns={[
          { header: 'Sede', cell: (row) => row.name },
          { header: 'Institución', cell: (row) => row.institutionName },
          { header: 'Ciudad', cell: (row) => row.cityName },
          { header: 'Principal', cell: (row) => (row.isMain ? 'Sí' : '—') },
          { header: 'Estado', cell: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </main>
  );
}
