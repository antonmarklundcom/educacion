import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable } from '@/components/admin/AdminTable';
import { Badge, Button, Select } from '@/components/ui';
import {
  deriveEnrollmentStatus,
  listAdmissionsAdmin,
  todayIso,
} from '@/db/queries/admin/admissions';
import { listInstitutionOptions } from '@/db/queries/admin/options';
import { ENROLLMENT_STATUS_LABELS } from '@/lib/search/labels';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TONE = {
  abiertas: 'ok',
  proximamente: 'warn',
  cerradas: 'danger',
  sin_datos: 'neutral',
} as const;

export default async function AdminAdmissionsPage({
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
  const rawInstitution = params.institucion;
  const institutionId =
    Number(Array.isArray(rawInstitution) ? rawInstitution[0] : rawInstitution) || null;
  const rawPage = params.page;
  const page = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage) > 0 ? Number(rawPage) : 1;

  const [{ rows, total, pageSize }, institutions] = await Promise.all([
    listAdmissionsAdmin(user, { institutionId, page }),
    listInstitutionOptions(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const today = todayIso();
  const query = institutionId ? `institucion=${institutionId}&` : '';

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-bold">Convocatorias</h1>
          <p className="text-muted max-w-prose text-sm">
            El estado de inscripción de cada oferta sale de acá — no se escribe a mano. Guardar una
            convocatoria lo recalcula al instante para todo lo que cubre.
          </p>
        </div>
        <Button href="/admin/admisiones/nuevo">Cargá una convocatoria</Button>
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
        emptyLabel="No hay convocatorias cargadas para este filtro."
        editHref={(row) => `/admin/admisiones/${row.id}`}
        page={page}
        totalPages={totalPages}
        buildPageHref={(p) => `/admin/admisiones?${query}page=${p}`}
        columns={[
          {
            header: 'Alcance',
            cell: (row) => (
              <span className="text-body">
                {row.institutionShort ?? '—'}
                <span className="text-faint block text-xs">
                  {row.programName ??
                    (row.scope === 'institution' ? 'Toda la institución' : 'Oferta puntual')}
                </span>
              </span>
            ),
          },
          { header: 'Período', cell: (row) => row.periodLabel },
          {
            header: 'Ventana',
            numeric: true,
            cell: (row) =>
              row.registrationOpens || row.registrationCloses
                ? `${row.registrationOpens ?? '—'} → ${row.registrationCloses ?? '—'}`
                : 'Sin fechas',
          },
          {
            header: 'Deriva a',
            cell: (row) => {
              const status = deriveEnrollmentStatus(row, today);
              return <Badge tone={TONE[status]}>{ENROLLMENT_STATUS_LABELS[status]}</Badge>;
            },
          },
        ]}
      />
    </main>
  );
}
