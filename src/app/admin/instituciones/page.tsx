import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable, StatusBadge } from '@/components/admin/AdminTable';
import { Button, Input } from '@/components/ui';
import { listInstitutionsAdmin } from '@/db/queries/admin/institutions';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminInstitutionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : '';
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const { rows, total, pageSize } = await listInstitutionsAdmin(user, { q, page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-ink text-2xl font-bold">Instituciones</h1>
        <Button href="/admin/instituciones/nueva">Agregá una institución</Button>
      </div>

      <form method="GET" className="flex max-w-sm gap-2">
        <Input
          type="search"
          name="q"
          placeholder="Buscar por nombre…"
          defaultValue={q}
          aria-label="Buscar institución"
        />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <AdminTable
        rows={rows}
        emptyLabel={
          q
            ? 'Ninguna institución coincide con esa búsqueda.'
            : 'Todavía no hay instituciones cargadas.'
        }
        editHref={(row) => `/admin/instituciones/${row.id}`}
        page={page}
        totalPages={totalPages}
        buildPageHref={(p) =>
          `/admin/instituciones?${q ? `q=${encodeURIComponent(q)}&` : ''}page=${p}`
        }
        columns={[
          { header: 'Nombre corto', cell: (row) => row.nameShort },
          { header: 'Nombre oficial', cell: (row) => row.nameOfficial },
          {
            header: 'Gestión',
            cell: (row) => (row.management === 'publica' ? 'Pública' : 'Privada'),
          },
          { header: 'Estado', cell: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </main>
  );
}
