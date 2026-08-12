import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable } from '@/components/admin/AdminTable';
import { Badge, Button, Select } from '@/components/ui';
import { listPricesAdmin } from '@/db/queries/admin/prices';
import { listInstitutionOptions } from '@/db/queries/admin/options';
import { formatGs } from '@/lib/format';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';
import { priceFreshness } from '@/db/invariants';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The current arancel of every offering, with the 12-month rule shown as a
 * badge rather than applied silently.
 *
 * Since PR-33 a stale arancel is shown on the public pages too, under a
 * "dato desactualizado" warning — so this badge no longer says "oculto en el
 * sitio", it says what is actually true: the number is out there carrying a
 * warning, and it is on the re-verification queue.
 */
export default async function AdminPricesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const params = await searchParams;
  const institutionId = Number(one(params, 'institucion')) || null;
  const page = Number(one(params, 'page')) > 0 ? Number(one(params, 'page')) : 1;

  const [{ rows, total, pageSize }, institutions] = await Promise.all([
    listPricesAdmin(user, { institutionId, page }),
    listInstitutionOptions(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const query = institutionId ? `institucion=${institutionId}&` : '';

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-bold">Aranceles</h1>
          <p className="text-muted max-w-prose text-sm">
            Un arancel con más de 12 meses sí se muestra, con un aviso visible de que está
            desactualizado y la fecha de la última verificación. Reverificarlo es lo que saca ese
            aviso.
          </p>
        </div>
        <Button
          href={
            institutionId
              ? `/admin/aranceles/nuevo?institucion=${institutionId}`
              : '/admin/aranceles/nuevo'
          }
        >
          Cargá un arancel
        </Button>
      </div>

      <form method="GET" className="flex max-w-md items-end gap-2">
        <Select
          id="institucion"
          name="institucion"
          label="Institución"
          defaultValue={institutionId ? String(institutionId) : ''}
        >
          <option value="">Todas</option>
          {institutions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filtrá
        </Button>
      </form>

      <AdminTable
        rows={rows}
        emptyLabel="Todavía no hay aranceles cargados para este filtro."
        editHref={(row) => `/admin/aranceles/${row.id}`}
        page={page}
        totalPages={totalPages}
        buildPageHref={(p) => `/admin/aranceles?${query}page=${p}`}
        columns={[
          { header: 'Institución', cell: (row) => row.institutionShort },
          {
            header: 'Oferta',
            cell: (row) => (
              <span className="text-body">
                {row.programName}
                <span className="text-faint block text-xs">
                  {row.campusName} · {row.modality} · {row.shift}
                </span>
              </span>
            ),
          },
          {
            header: 'Cuota',
            numeric: true,
            cell: (row) =>
              row.isFree ? 'Gratuita' : row.monthlyFee != null ? formatGs(row.monthlyFee) : '—',
          },
          {
            header: 'Costo anual',
            numeric: true,
            cell: (row) => (row.annualCost != null ? formatGs(row.annualCost) : 'Sin datos'),
          },
          {
            header: 'Verificado',
            cell: (row) =>
              priceFreshness(row.verifiedAt) === 'fresh' ? (
                <Badge tone="ok">Vigente</Badge>
              ) : (
                <Badge tone="warn">Se muestra con aviso</Badge>
              ),
          },
        ]}
      />
    </main>
  );
}
