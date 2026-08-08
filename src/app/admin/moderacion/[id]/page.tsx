import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ConflictResolver, type ConflictField } from '@/components/admin/ConflictResolver';
import { Badge } from '@/components/ui';
import { getConflict, proposedColumns } from '@/db/queries/admin/conflicts';
import { formatDate } from '@/lib/format';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { resolveConflictAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface MatchCandidate {
  id?: number;
  name?: string;
  score?: number;
}

export default async function ConflictDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const conflict = await getConflict(user, id);
  if (!conflict) notFound();

  const columns = proposedColumns(conflict.proposedJson);
  const fields: ConflictField[] = conflict.differing.map((name) => ({
    name,
    current: conflict.currentJson?.[name] ?? null,
    proposed: columns[name] ?? null,
    isProtected: conflict.protectedFields.includes(name),
  }));

  // The candidates are the whole value of an `ambiguous_match` row: a score
  // alone tells a moderator nothing about which institution the source meant.
  const candidates = (conflict.proposedJson.matchCandidates ?? []) as MatchCandidate[];
  const resolved = conflict.status !== 'open';

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin/moderacion" className="text-muted hover:text-ink text-sm">
          ← Moderación
        </Link>
        <h1 className="text-ink text-2xl font-bold">
          {conflict.entityType} {conflict.entityId != null ? `#${conflict.entityId}` : '(nuevo)'}
        </h1>
        <p className="text-muted text-sm">
          {conflict.sourceName ?? 'Fuente desconocida'} · encolado {formatDate(conflict.createdAt)}
          {conflict.matchScore != null && ` · coincidencia ${conflict.matchScore}`}
        </p>
        {conflict.notes && <p className="text-body text-sm">Motivo: {conflict.notes}</p>}
        {conflict.sourceUrl && (
          <a
            href={conflict.sourceUrl}
            className="text-ink self-start text-sm underline underline-offset-4"
          >
            Ver la fuente
          </a>
        )}
      </div>

      {conflict.protectedFields.length > 0 && (
        <p className="border-warn/40 bg-warn-bg text-body rounded-md border px-4 py-3 text-sm">
          Esto tocó{' '}
          {conflict.protectedFields.length === 1 ? 'un campo protegido' : 'campos protegidos'} (
          {conflict.protectedFields.join(', ')}). Por eso no se aplicó solo: la revisión humana es
          exactamente lo que esa lista estaba esperando.
        </p>
      )}

      {candidates.length > 0 && (
        <section className="border-border flex flex-col gap-1 rounded-md border px-4 py-3">
          <h2 className="text-ink text-sm font-semibold">
            Candidatos que consideró el emparejador
          </h2>
          <ul className="text-body flex flex-col gap-0.5 text-sm">
            {candidates.map((candidate, index) => (
              <li key={candidate.id ?? index}>
                {candidate.name ?? `#${candidate.id ?? '?'}`}
                {candidate.score != null && (
                  <span className="text-faint font-mono"> · {candidate.score}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {resolved ? (
        <div className="flex flex-col gap-3">
          <Badge tone="neutral">Ya resuelto: {conflict.status}</Badge>
          <p className="text-muted text-sm">
            Este conflicto ya no está abierto, así que no se puede volver a aplicar. Si la fuente
            volvió a cambiar, la próxima importación va a encolarlo de nuevo.
          </p>
        </div>
      ) : (
        <ConflictResolver
          entityType={conflict.entityType}
          isCreate={conflict.entityId == null}
          fields={fields}
          action={resolveConflictAction.bind(null, id)}
        />
      )}

      <section className="border-border flex flex-col gap-2 border-t pt-6">
        <h2 className="text-ink text-lg font-semibold">Propuesta completa</h2>
        <pre className="border-border bg-card-alt text-body overflow-x-auto rounded-md border p-3 text-xs">
          {JSON.stringify(columns, null, 2)}
        </pre>
      </section>
    </main>
  );
}
