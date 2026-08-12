import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui';
import { DisputeResolveForm } from '@/components/admin/DisputeResolveForm';
import { getDispute } from '@/db/queries/panel/disputes';
import { getInstitutionNames } from '@/db/queries/institutions';
import { ACCREDITATION_STATUS_LABELS } from '@/lib/search/labels';
import { formatDate } from '@/lib/format';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const dispute = await getDispute(user, id);
  if (!dispute) notFound();

  const institutionName = dispute.institutionId
    ? (await getInstitutionNames([dispute.institutionId])).get(dispute.institutionId)
    : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link href="/admin/disputas" className="text-muted hover:text-ink text-sm">
        ← Disputas
      </Link>

      <div className="border-border bg-surface flex flex-col gap-4 rounded-md border p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-ink text-xl font-bold">
              Acreditación #{dispute.entityId} — {institutionName ?? `institución #${dispute.institutionId}`}
            </h1>
            <p className="text-muted text-sm">
              {dispute.agency ?? '—'}
              {dispute.accreditationStatus
                ? ` · ${ACCREDITATION_STATUS_LABELS[dispute.accreditationStatus]}`
                : ''}
              {dispute.resolutionNumber ? ` · Res. ${dispute.resolutionNumber}` : ''}
            </p>
          </div>
          {dispute.isDisputed && <Badge tone="warn">En revisión</Badge>}
        </div>

        {dispute.sourceUrl && (
          <a
            href={dispute.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-ink text-sm underline underline-offset-4"
          >
            Ver la fuente citada
          </a>
        )}

        {dispute.entityId && (
          <Link
            href={`/admin/acreditaciones/${dispute.entityId}`}
            className="text-ink text-sm underline underline-offset-4"
          >
            Editar este registro en /admin/acreditaciones
          </Link>
        )}

        <div>
          <h2 className="text-ink text-sm font-semibold">Motivo de la institución</h2>
          <p className="text-body text-sm whitespace-pre-wrap">{dispute.notes ?? 'Sin detalle.'}</p>
        </div>

        <p className="text-faint text-xs">Recibida el {formatDate(dispute.createdAt)}</p>
      </div>

      <DisputeResolveForm id={dispute.id} />
    </main>
  );
}
