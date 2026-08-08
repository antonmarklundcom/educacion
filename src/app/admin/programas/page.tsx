import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable, StatusBadge } from '@/components/admin/AdminTable';
import { Button, Input } from '@/components/ui';
import { listProgramsAdmin } from '@/db/queries/admin/programs';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';
import { LEVEL_LABELS } from '@/lib/search/labels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminProgramsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : '';
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const { rows, total, pageSize } = await listProgramsAdmin(user, { q, page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Programas</h1>
        <Button href="/admin/programas/nueva">Agregá un programa</Button>
      </div>

      <form method="GET" className="flex max-w-sm gap-2">
        <Input
          type="search"
          name="q"
          placeholder="Buscar por nombre…"
          defaultValue={q}
          aria-label="Buscar programa"
        />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <AdminTable
        rows={rows}
        emptyLabel={q ? 'Ningún programa coincide con esa búsqueda.' : 'Todavía no hay programas cargados.'}
        editHref={(row) => `/admin/programas/${row.id}`}
        page={page}
        totalPages={totalPages}
        buildPageHref={(p) => `/admin/programas?${q ? `q=${encodeURIComponent(q)}&` : ''}page=${p}`}
        columns={[
          { header: 'Programa', cell: (row) => row.nameOfficial },
          { header: 'Institución', cell: (row) => row.institutionName },
          { header: 'Nivel', cell: (row) => LEVEL_LABELS[row.level] },
          { header: 'Estado', cell: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </main>
  );
}
