import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable } from '@/components/admin/AdminTable';
import { Badge, Button, Select } from '@/components/ui';
import { listConflicts, listRecentImportRuns } from '@/db/queries/admin/conflicts';
import { CONFLICT_ENTITY } from '@/db/schema';
import { formatDate } from '@/lib/format';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const KIND_LABELS: Record<string, string> = {
  new: 'Nuevo',
  changed: 'Cambió',
  conflict: 'Campo protegido',
  ambiguous_match: 'Coincidencia dudosa',
};

const KIND_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  new: 'neutral',
  changed: 'neutral',
  conflict: 'warn',
  ambiguous_match: 'danger',
};

const STATUS_TABS = [
  { value: 'open', label: 'Pendientes' },
  { value: 'applied', label: 'Aplicados' },
  { value: 'rejected', label: 'Rechazados' },
  { value: 'superseded', label: 'Superados' },
] as const;

/**
 * The queue PR-06 has been filling since Phase 0 with nothing to read it.
 *
 * Everything the importer would not write automatically lands here: a changed
 * protected field, a fuzzy institution match, a new institution whose
 * `management` neither register prints, an accreditation with no citation. The
 * acceptance criterion is that a full import cycle can be worked through from
 * this page without a single line of manual SQL.
 */
export default async function ModerationQueuePage({
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
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const status = (STATUS_TABS.find((tab) => tab.value === one('estado'))?.value ??
    'open') as 'open';
  const entityType = (CONFLICT_ENTITY as readonly string[]).includes(one('tipo') ?? '')
    ? (one('tipo') as never)
    : null;
  const page = Number(one('page')) > 0 ? Number(one('page')) : 1;

  const [{ rows, total, pageSize }, runs] = await Promise.all([
    listConflicts(user, { status, entityType, page }),
    listRecentImportRuns(user),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const query = [`estado=${status}`, entityType ? `tipo=${entityType}` : null]
    .filter(Boolean)
    .join('&');

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Moderación de importación</h1>
        <p className="text-muted max-w-prose text-sm">
          Todo lo que el importador no puede escribir solo espera acá. Aprobar aplica el cambio por
          el mismo camino que usa el importador, así que nada que él rechazaría entra por esta
          puerta.
        </p>
      </div>

      {runs.length > 0 && (
        <section className="border-border bg-card-alt rounded-md border px-4 py-3">
          <h2 className="text-ink text-sm font-semibold">Últimas importaciones</h2>
          <ul className="text-muted mt-1 flex flex-col gap-0.5 text-sm">
            {runs.map((run) => (
              <li key={String(run.id)}>
                <span className="text-body font-medium">{run.source}</span> ·{' '}
                {formatDate(run.startedAt)} · {run.rowsIn} filas, {run.rowsNew} aplicadas,{' '}
                {run.rowsConflicted} en cola
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <nav aria-label="Estado" className="flex gap-1">
          {STATUS_TABS.map((tab) => (
            <a
              key={tab.value}
              href={`/admin/moderacion?estado=${tab.value}`}
              aria-current={tab.value === status ? 'page' : undefined}
              className={
                tab.value === status
                  ? 'bg-ink rounded-md px-3 py-2 text-sm font-medium text-white'
                  : 'text-body hover:bg-card-alt rounded-md px-3 py-2 text-sm'
              }
            >
              {tab.label}
            </a>
          ))}
        </nav>

        <form method="GET" className="flex items-end gap-2">
          <input type="hidden" name="estado" value={status} />
          <Select id="tipo" name="tipo" label="Entidad" defaultValue={entityType ?? ''}>
            <option value="">Todas</option>
            {CONFLICT_ENTITY.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Filtrá
          </Button>
        </form>
      </div>

      <AdminTable
        rows={rows}
        emptyLabel={
          status === 'open'
            ? 'No hay nada pendiente. La última importación no dejó conflictos sin resolver.'
            : 'No hay registros con ese estado.'
        }
        editHref={(row) => `/admin/moderacion/${row.id}`}
        page={page}
        totalPages={totalPages}
        buildPageHref={(p) => `/admin/moderacion?${query}&page=${p}`}
        columns={[
          { header: 'Entidad', cell: (row) => row.entityType },
          {
            header: 'Motivo',
            cell: (row) => (
              <span>
                <Badge tone={KIND_TONE[row.kind] ?? 'neutral'}>
                  {KIND_LABELS[row.kind] ?? row.kind}
                </Badge>
                {row.notes && <span className="text-faint block text-xs">{row.notes}</span>}
              </span>
            ),
          },
          { header: 'Fuente', cell: (row) => row.sourceName ?? '—' },
          {
            header: 'Coincidencia',
            numeric: true,
            cell: (row) => (row.matchScore != null ? `${row.matchScore}` : '—'),
          },
          { header: 'Encolado', cell: (row) => formatDate(row.createdAt) },
        ]}
      />
    </main>
  );
}
