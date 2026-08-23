import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PanelNav } from '@/components/panel/PanelNav';
import { Badge } from '@/components/ui';
import { listPanelLeads } from '@/db/queries/panel/leads';
import { countEventsByType } from '@/db/queries/events';
import { panelInstitutionId } from '@/db/queries/panel/scope';
import { formatDate } from '@/lib/format';
import { formatParaguayanPhone } from '@/lib/leads/phone';
import { AGE_BRACKET_LABELS } from '@/lib/leads/contract';
import { LEAD_STATUS_LABELS } from '@/lib/leads/labels';
import { LeadSlaBadge, LeadSlaBanner } from '@/components/panel/LeadSla';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';
import type { LeadStatus } from '@/lib/leads/contract';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

const STATUS_TABS: Array<{ value: LeadStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'new', label: 'Nuevas' },
  { value: 'sent', label: 'Enviadas' },
  { value: 'contacted', label: 'Contactadas' },
  { value: 'qualified', label: 'Calificadas' },
  { value: 'discarded', label: 'Descartadas' },
];

const STATUS_TONE: Record<LeadStatus, 'ok' | 'warn' | 'info' | 'danger' | 'neutral'> = {
  new: 'warn',
  sent: 'info',
  contacted: 'ok',
  qualified: 'ok',
  discarded: 'neutral',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function PanelLeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  const params = await searchParams;
  const statusParam = one(params, 'estado');
  const status = STATUS_TABS.some((tab) => tab.value === statusParam)
    ? (statusParam as LeadStatus | 'all')
    : 'all';
  const page = Number(one(params, 'page')) > 0 ? Number(one(params, 'page')) : 1;

  // One clock for the whole render: the badge on a row and the count in the
  // banner must not be measured a few milliseconds apart and disagree.
  const now = new Date();

  let data;
  let whatsappClicksTotal = 0;
  try {
    const institutionId = panelInstitutionId(user);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const [leadsPage, events] = await Promise.all([
      listPanelLeads(user, { status: status === 'all' ? undefined : status, page, now }),
      countEventsByType({ since: thirtyDaysAgo, until: now }, institutionId),
    ]);
    data = leadsPage;
    whatsappClicksTotal = events.find((row) => row.type === 'whatsapp_click')?.events ?? 0;
  } catch (error) {
    if (error instanceof AuthError) redirect('/ingresar');
    throw error;
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const query = status !== 'all' ? `estado=${status}&` : '';

  return (
    <>
      <PanelNav current="/panel/leads" />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-ink text-2xl font-bold">Solicitudes</h1>
            <p className="text-muted max-w-prose text-sm">
              Personas que pidieron información sobre tus carreras. También abrieron un chat de
              WhatsApp con ustedes <strong>{whatsappClicksTotal}</strong>{' '}
              {whatsappClicksTotal === 1 ? 'vez' : 'veces'} en los últimos 30 días — esas
              conversaciones no las vemos, pero el clic sí lo contamos.
            </p>
          </div>
          <Link
            href="/panel/leads/export"
            className="border-border-strong bg-surface text-ink hover:bg-card-alt inline-flex min-h-12 items-center rounded-md border px-5 text-sm font-medium"
          >
            Exportar CSV
          </Link>
        </div>

        {!data.contactVisible && (
          <p className="border-warn/40 bg-warn-bg text-body rounded-md border px-4 py-3 text-sm">
            Tu plan actual muestra cuántas solicitudes llegaron pero no el contacto de la persona.
            Escribinos si querés pasar a un plan que lo incluya.
          </p>
        )}

        <LeadSlaBanner count={data.overdueCount} />

        <nav aria-label="Estado" className="flex flex-wrap gap-1">
          {STATUS_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={tab.value === 'all' ? '/panel/leads' : `/panel/leads?estado=${tab.value}`}
              aria-current={tab.value === status ? 'page' : undefined}
              className={
                tab.value === status
                  ? 'bg-ink rounded-md px-3 py-2 text-sm font-medium text-white'
                  : 'text-body hover:bg-card-alt rounded-md px-3 py-2 text-sm'
              }
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {data.rows.length === 0 ? (
          <p className="border-border bg-card-alt text-muted rounded-md border px-4 py-6 text-sm">
            No hay solicitudes con ese estado.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/panel/leads/${row.id}`}
                  className="border-border bg-surface hover:bg-card-alt flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="text-ink block font-medium">
                      {row.name ?? 'Contacto no disponible en tu plan'}
                    </span>
                    <span className="text-muted block text-sm">
                      {row.programName ?? 'Carrera'} ·{' '}
                      {row.phoneE164 ? formatParaguayanPhone(row.phoneE164) : '—'} ·{' '}
                      {AGE_BRACKET_LABELS[row.ageBracket]} · {formatDate(row.createdAt)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <LeadSlaBadge lead={row} now={now} />
                    <Badge tone={STATUS_TONE[row.status]}>{LEAD_STATUS_LABELS[row.status]}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav aria-label="Páginas" className="flex flex-wrap gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={`/panel/leads?${query}page=${p}`}
                aria-current={p === page ? 'page' : undefined}
                className={
                  p === page
                    ? 'bg-ink rounded-md px-3 py-2 text-sm font-medium text-white'
                    : 'text-body hover:bg-card-alt rounded-md px-3 py-2 text-sm'
                }
              >
                {p}
              </Link>
            ))}
          </nav>
        )}
      </main>
    </>
  );
}
