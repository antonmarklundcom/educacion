import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable } from '@/components/admin/AdminTable';
import { Badge, Button, Select } from '@/components/ui';
import { listPricesAdmin } from '@/db/queries/admin/prices';
import { listInstitutionOptions } from '@/db/queries/admin/options';
import { formatGs } from '@/lib/format';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';
import { isPriceDisplayable } from '@/db/invariants';

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
 * The admin is the one place that *should* see a stale number — you cannot
 * re-verify what you cannot read — so the amount stays visible here and the
 * badge says "Oculto en el sitio". That is not a loophole in
 * `isPriceDisplayable`: the public pages read `program_search` through
 * `searchPrograms()`, which strips the amounts before a component ever sees
 * them (`data-model.md` §5).
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
            Un arancel con más de 12 meses no se muestra en ninguna parte del sitio. Acá lo ves
            igual, porque no se puede reverificar lo que no se puede leer.
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
              isPriceDisplayable(row.verifiedAt) ? (
                <Badge tone="ok">Vigente</Badge>
              ) : (
                <Badge tone="warn">Oculto en el sitio</Badge>
              ),
          },
        ]}
      />
    </main>
  );
}
