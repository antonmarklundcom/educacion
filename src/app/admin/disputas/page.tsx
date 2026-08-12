import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui';
import { listOpenDisputes } from '@/db/queries/panel/disputes';
import { ACCREDITATION_STATUS_LABELS } from '@/lib/search/labels';
import { formatDate } from '@/lib/format';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Every open institution-filed dispute on an accreditation record (PR-24).
 * Deliberately separate from `/admin/moderacion`: that queue's "approve"
 * applies a proposed field diff, and a dispute proposes nothing — it is a
 * report, resolved by `resolveAccreditationDispute` instead
 * (`db/queries/panel/disputes.ts`).
 */
export default async function AdminDisputesPage() {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const disputes = await listOpenDisputes(user);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Disputas de acreditación</h1>
        <p className="text-muted max-w-prose text-sm">
          Una institución disputó estos registros. El badge público está suspendido mientras están
          acá — corregí el dato en{' '}
          <Link href="/admin/acreditaciones" className="underline underline-offset-4">
            /admin/acreditaciones
          </Link>{' '}
          si hace falta, y después resolvé la disputa.
        </p>
      </div>

      {disputes.length === 0 ? (
        <p className="border-border bg-card-alt text-muted rounded-md border px-4 py-6 text-sm">
          No hay disputas pendientes.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {disputes.map((dispute) => (
            <li key={dispute.id}>
              <Link
                href={`/admin/disputas/${dispute.id}`}
                className="border-border bg-surface hover:bg-card-alt flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="text-ink block font-medium">
                    Acreditación #{dispute.entityId} — {dispute.agency ?? '—'}
                    {dispute.accreditationStatus
                      ? ` · ${ACCREDITATION_STATUS_LABELS[dispute.accreditationStatus]}`
                      : ''}
                  </span>
                  <span className="text-muted block truncate text-sm">
                    {dispute.notes ?? 'Sin detalle'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {dispute.isDisputed && <Badge tone="warn">En revisión</Badge>}
                  <span className="text-faint text-xs">{formatDate(dispute.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
