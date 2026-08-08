/**
 * `/admin/reclamos` — the claim queue (PR-22).
 *
 * Reading it is `editor`; deciding is `admin`, and that check lives in
 * `approveClaim`/`rejectClaim` rather than here. The list therefore shows
 * everything to a curator and simply produces no usable buttons for them on the
 * detail page.
 *
 * The column that matters is **Verificación**: a claim that already passed the
 * domain check needs nobody — it appears here only so a human can see it
 * happened. What actually needs work is `awaiting_review`, which is what the
 * default tab shows first.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable } from '@/components/admin/AdminTable';
import { Badge } from '@/components/ui';
import { listClaims, type ClaimFilter, type ClaimRow } from '@/lib/claims';
import { formatDate } from '@/lib/format';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS: { value: ClaimFilter; label: string }[] = [
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'aprobados', label: 'Aprobados' },
  { value: 'rechazados', label: 'Rechazados' },
  { value: 'todos', label: 'Todos' },
];

const STATE_LABELS: Record<
  ClaimRow['state'],
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }
> = {
  awaiting_review: { label: 'Esperando decisión', tone: 'warn' },
  awaiting_claimant: { label: 'Enlace enviado', tone: 'neutral' },
  approved: { label: 'Reclamado', tone: 'ok' },
  rejected: { label: 'Rechazado', tone: 'danger' },
  expired: { label: 'Vencido', tone: 'neutral' },
};

export default async function ClaimsQueuePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const params = await searchParams;
  const raw = Array.isArray(params.estado) ? params.estado[0] : params.estado;
  const filter = TABS.find((tab) => tab.value === raw)?.value ?? 'pendientes';

  const rows = await listClaims(user, filter);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Reclamos de perfil</h1>
        <p className="text-muted max-w-prose text-sm">
          Una institución cuyo correo está en el dominio de su propio sitio se verifica sola. Lo que
          espera acá es el resto: instituciones sin sitio registrado, dominios que no coinciden y
          correos personales. Aprobar manda un enlace nuevo que sirve una sola vez y vence en 72
          horas.
        </p>
      </div>

      <nav aria-label="Estado" className="flex gap-1">
        {TABS.map((tab) => (
          <a
            key={tab.value}
            href={`/admin/reclamos?estado=${tab.value}`}
            aria-current={tab.value === filter ? 'page' : undefined}
            className={
              tab.value === filter
                ? 'bg-ink rounded-md px-3 py-2 text-sm font-medium text-white'
                : 'text-body hover:bg-card-alt rounded-md px-3 py-2 text-sm'
            }
          >
            {tab.label}
          </a>
        ))}
      </nav>

      <AdminTable
        rows={rows}
        emptyLabel="No hay solicitudes con ese estado."
        editHref={(row) => `/admin/reclamos/${row.id}`}
        page={1}
        totalPages={1}
        buildPageHref={() => `/admin/reclamos?estado=${filter}`}
        columns={[
          { header: 'Institución', cell: (row) => row.institutionName },
          {
            header: 'Solicitante',
            cell: (row) => (
              <span>
                {row.email}
                {row.contactName && (
                  <span className="text-faint block text-xs">{row.contactName}</span>
                )}
              </span>
            ),
          },
          {
            header: 'Verificación',
            cell: (row) => (
              <Badge tone={row.domainVerified ? 'ok' : 'warn'}>
                {row.domainVerified ? 'Dominio verificado' : 'Sin verificar'}
              </Badge>
            ),
          },
          {
            header: 'Estado',
            cell: (row) => (
              <Badge tone={STATE_LABELS[row.state].tone}>{STATE_LABELS[row.state].label}</Badge>
            ),
          },
          { header: 'Pedido', cell: (row) => formatDate(row.createdAt) },
        ]}
      />
    </main>
  );
}
