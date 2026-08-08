import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable, StatusBadge } from '@/components/admin/AdminTable';
import { Button, Input } from '@/components/ui';
import { listCareersAdmin } from '@/db/queries/admin/careers';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';
import { LEVEL_LABELS } from '@/lib/search/labels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminCareersPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : '';
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const { rows, total, pageSize } = await listCareersAdmin(user, { q, page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-ink text-2xl font-bold">Carreras</h1>
        <Button href="/admin/carreras/nueva">Agregá una carrera</Button>
      </div>

      <form method="GET" className="flex max-w-sm gap-2">
        <Input
          type="search"
          name="q"
          placeholder="Buscar por nombre…"
          defaultValue={q}
          aria-label="Buscar carrera"
        />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <AdminTable
        rows={rows}
        emptyLabel={
          q ? 'Ninguna carrera coincide con esa búsqueda.' : 'Todavía no hay carreras cargadas.'
        }
        editHref={(row) => `/admin/carreras/${row.id}`}
        page={page}
        totalPages={totalPages}
        buildPageHref={(p) => `/admin/carreras?${q ? `q=${encodeURIComponent(q)}&` : ''}page=${p}`}
        columns={[
          { header: 'Nombre', cell: (row) => row.nameEs },
          { header: 'Nivel por defecto', cell: (row) => LEVEL_LABELS[row.levelDefault] },
          { header: 'Estado', cell: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </main>
  );
}
