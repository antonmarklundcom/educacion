import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable } from '@/components/admin/AdminTable';
import { Badge, Button, Select } from '@/components/ui';
import { listAccreditationsAdmin } from '@/db/queries/admin/accreditations';
import { listInstitutionOptions } from '@/db/queries/admin/options';
import { ACCREDITATION_STATUS } from '@/db/schema';
import { ACCREDITATION_STATUS_LABELS } from '@/lib/search/labels';
import { formatDate } from '@/lib/format';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  vigente: 'ok',
  en_proceso: 'warn',
  vencida: 'warn',
  no_acreditada: 'danger',
  sin_datos: 'neutral',
};

export default async function AdminAccreditationsPage({
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
  const institutionId = Number(one(params, 'institucion')) || null;
  const status = one(params, 'estado') ?? null;
  const page = Number(one(params, 'page')) > 0 ? Number(one(params, 'page')) : 1;

  const [{ rows, total, pageSize }, institutions] = await Promise.all([
    listAccreditationsAdmin(user, { institutionId, status, page }),
    listInstitutionOptions(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const query = [
    institutionId ? `institucion=${institutionId}` : null,
    status ? `estado=${status}` : null,
  ]
    .filter(Boolean)
    .join('&');

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-bold">Acreditaciones</h1>
          <p className="text-muted max-w-prose text-sm">
            Ningún estado que afirme algo se guarda sin número de resolución o enlace a la fuente.
            Lo desconocido es “Sin datos”, nunca “No acreditada”.
          </p>
        </div>
        <Button href="/admin/acreditaciones/nuevo">Cargá una acreditación</Button>
      </div>

      <form method="GET" className="flex max-w-2xl flex-wrap items-end gap-2">
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
        <Select id="estado" name="estado" label="Estado" defaultValue={status ?? ''}>
          <option value="">Todos</option>
          {ACCREDITATION_STATUS.map((value) => (
            <option key={value} value={value}>
              {ACCREDITATION_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filtrá
        </Button>
      </form>

      <AdminTable
        rows={rows}
        emptyLabel="No hay acreditaciones cargadas para este filtro."
        editHref={(row) => `/admin/acreditaciones/${row.id}`}
        page={page}
        totalPages={totalPages}
        buildPageHref={(p) => `/admin/acreditaciones?${query ? `${query}&` : ''}page=${p}`}
        columns={[
          {
            header: 'Alcance',
            cell: (row) => (
              <span className="text-body">
                {row.institutionShort ?? '—'}
                <span className="text-faint block text-xs">
                  {row.programName ??
                    (row.scope === 'institution'
                      ? 'Toda la institución'
                      : `#${row.offeringId ?? ''}`)}
                </span>
              </span>
            ),
          },
          { header: 'Agencia', cell: (row) => row.agency },
          {
            header: 'Estado',
            cell: (row) => (
              <Badge tone={TONE[row.status] ?? 'neutral'}>
                {ACCREDITATION_STATUS_LABELS[row.status]}
              </Badge>
            ),
          },
          {
            header: 'Fuente',
            cell: (row) =>
              row.sourceUrl ? (
                <a href={row.sourceUrl} className="text-ink underline underline-offset-4">
                  enlace
                </a>
              ) : (
                (row.resolutionNumber ?? '—')
              ),
          },
          {
            header: 'Verificado',
            cell: (row) => (row.verifiedAt ? formatDate(row.verifiedAt) : 'Sin verificar'),
          },
        ]}
      />
    </main>
  );
}
