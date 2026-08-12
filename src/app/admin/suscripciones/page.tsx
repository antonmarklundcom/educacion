import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable, type AdminColumn } from '@/components/admin/AdminTable';
import { Badge, Button } from '@/components/ui';
import { listSubscriptionsAdmin, type AdminSubscriptionRow } from '@/db/queries/subscriptions';
import { formatGs } from '@/lib/format';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';
import { PAST_DUE_GRACE_DAYS, subscriptionStanding, dateOnly } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Every subscription we have sold, and — the column that matters — whether it
 * is granting anything **today**.
 *
 * "Activa" in the status column is what the operator wrote down; "Vigente hoy"
 * is what `resolveEntitlements` actually answers on every request. They come
 * apart the day a period ends, which is exactly the day somebody asks why the
 * badge disappeared, so the two are shown side by side rather than collapsed
 * into one reassuring word.
 */
export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await currentUser();
  try {
    requireRole(user, ['admin']);
  } catch {
    notFound();
  }

  const params = await searchParams;
  const page = Number(one(params, 'page')) > 0 ? Number(one(params, 'page')) : 1;

  const { rows, total, pageSize } = await listSubscriptionsAdmin(user, { page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const today = dateOnly(new Date());

  const columns: AdminColumn<AdminSubscriptionRow>[] = [
    { header: 'Institución', cell: (row) => row.institutionName },
    { header: 'Plan', cell: (row) => row.planName },
    {
      header: 'Período',
      numeric: true,
      cell: (row) => `${row.startsOn} → ${row.endsOn ?? 'sin fin'}`,
    },
    {
      header: 'Estado',
      cell: (row) => {
        if (row.status === 'active') return <Badge tone="ok">Activa</Badge>;
        if (row.status === 'trial') return <Badge tone="neutral">Prueba</Badge>;
        if (row.status === 'past_due') return <Badge tone="warn">Vencida sin pago</Badge>;
        return <Badge tone="neutral">Cancelada</Badge>;
      },
    },
    {
      header: 'Vigente hoy',
      cell: (row) => {
        const standing = subscriptionStanding(
          {
            id: row.id,
            institutionId: row.institutionId,
            status: row.status,
            startsOn: row.startsOn,
            endsOn: row.endsOn ?? null,
            planCode: row.planCode,
            planName: row.planName,
            planRank: (row.planRank as 0 | 1 | 2) ?? 0,
            includedLeadsMonth: null,
          },
          today,
          PAST_DUE_GRACE_DAYS,
        );
        return standing ? 'Sí' : 'No';
      },
    },
    { header: 'Factura', cell: (row) => row.invoiceRef ?? '—' },
    {
      header: 'Monto',
      numeric: true,
      cell: (row) => (row.invoicedAmountPyg != null ? formatGs(row.invoicedAmountPyg) : '—'),
    },
  ];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-bold">Suscripciones</h1>
          <p className="text-muted max-w-prose text-sm">
            Facturación manual: transferencia y factura desde FacturaPY, acá queda la referencia. Lo
            que una institución puede usar se resuelve de estas filas en cada request — no hay un
            plan guardado en otro lado.
          </p>
        </div>
        <Button href="/admin/suscripciones/nueva">Activá un plan</Button>
      </div>

      <AdminTable
        columns={columns}
        rows={rows}
        editHref={(row) => `/admin/suscripciones/${row.id}`}
        emptyLabel="Todavía no hay ninguna suscripción."
        page={page}
        totalPages={totalPages}
        buildPageHref={(next) => `/admin/suscripciones?page=${next}`}
      />
    </main>
  );
}
