import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { PanelNav } from '@/components/panel/PanelNav';
import { Badge } from '@/components/ui';
import { LeadStatusForm } from '@/components/panel/LeadStatusForm';
import { getPanelLead } from '@/db/queries/panel/leads';
import { formatDate } from '@/lib/format';
import { formatParaguayanPhone } from '@/lib/leads/phone';
import { AGE_BRACKET_LABELS } from '@/lib/leads/contract';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PanelLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId) || leadId <= 0) notFound();

  const user = await currentUser();

  let lead;
  try {
    lead = await getPanelLead(user, leadId);
  } catch (error) {
    if (error instanceof AuthError) redirect('/ingresar');
    throw error;
  }
  if (!lead) notFound();

  return (
    <>
      <PanelNav current="/panel/leads" />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Link href="/panel/leads" className="text-muted hover:text-ink text-sm">
          ← Volver a solicitudes
        </Link>

        <div className="border-border bg-surface flex flex-col gap-4 rounded-md border p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-ink text-xl font-bold">
                {lead.name ?? 'Contacto no disponible en tu plan'}
              </h1>
              <p className="text-muted text-sm">{lead.programName ?? 'Carrera'}</p>
            </div>
            <Badge tone="neutral">{AGE_BRACKET_LABELS[lead.ageBracket]}</Badge>
          </div>

          {lead.phoneE164 || lead.email ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {lead.phoneE164 && (
                <>
                  <dt className="text-muted">Teléfono</dt>
                  <dd className="text-ink font-mono">{formatParaguayanPhone(lead.phoneE164)}</dd>
                </>
              )}
              {lead.email && (
                <>
                  <dt className="text-muted">Email</dt>
                  <dd className="text-ink">{lead.email}</dd>
                </>
              )}
              {lead.message && (
                <>
                  <dt className="text-muted">Mensaje</dt>
                  <dd className="text-ink">{lead.message}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="border-warn/40 bg-warn-bg text-body rounded-md border px-4 py-3 text-sm">
              Tu plan actual no incluye el contacto de esta persona. Escribinos si querés pasar a
              un plan que lo incluya.
            </p>
          )}

          <p className="text-faint text-xs">
            Llegó el {formatDate(lead.createdAt)}
            {lead.deliveredAt ? `, te avisamos por email el ${formatDate(lead.deliveredAt)}.` : '.'}
          </p>
        </div>

        <LeadStatusForm leadId={lead.id} currentStatus={lead.status} />
      </main>
    </>
  );
}
