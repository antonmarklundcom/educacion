/**
 * One claim, with the evidence laid out (PR-22).
 *
 * The page's job is to make the decision *decidable*: the address that asked,
 * the domain we hold for the institution, why the automatic check did not pass,
 * and what the person said about themselves. Approving mints a fresh token and
 * mails it, so the decision is "does this person work there", not "should this
 * link work" — the link is always new.
 *
 * The buttons render for `editor` too and refuse server-side, because hiding
 * them is UX and `approveClaim` is what enforces the role (CLAUDE.md rule 4).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Card } from '@/components/ui';
import { getClaim, ROUTE_EXPLANATION, routeClaim } from '@/lib/claims';
import { formatDate } from '@/lib/format';
import { hasRole, requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { ClaimDecision } from '../ClaimDecision';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const claimId = Number((await params).id);
  if (!Number.isInteger(claimId) || claimId <= 0) notFound();

  const claim = await getClaim(user, claimId);
  if (!claim) notFound();

  // Recomputed rather than stored: it is a pure function of two fields the page
  // already has, and showing the *current* verdict is what an admin needs after
  // somebody corrects the institution's website.
  const route = routeClaim(claim.email, claim.institutionWebsite);
  const decidable = claim.state === 'awaiting_review' && !claim.institutionClaimed;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin/reclamos" className="text-muted hover:text-ink text-sm">
          ← Reclamos
        </Link>
        <h1 className="text-ink text-2xl font-bold">{claim.institutionName}</h1>
        <p className="text-muted text-sm">
          Solicitud #{claim.id} · {formatDate(claim.createdAt)}
        </p>
      </div>

      <Card className="flex flex-col gap-3">
        <Field label="Correo del solicitante">{claim.email}</Field>
        <Field label="Nombre declarado">{claim.contactName ?? '—'}</Field>
        <Field label="Cargo declarado">{claim.note ?? '—'}</Field>
        <Field label="Dominio del correo">{claim.emailDomain}</Field>
        <Field label="Sitio registrado de la institución">
          {claim.institutionWebsite ? (
            <a
              href={claim.institutionWebsite}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-body hover:text-ink break-all underline underline-offset-2"
            >
              {claim.institutionWebsite} ↗
            </a>
          ) : (
            'Sin sitio registrado'
          )}
        </Field>
        <Field label="Verificación automática">
          <span className="flex flex-col gap-1">
            <Badge tone={claim.domainVerified ? 'ok' : 'warn'}>
              {claim.domainVerified ? 'Dominio verificado' : 'No verificada'}
            </Badge>
            <span className="text-muted text-xs">{ROUTE_EXPLANATION[route.reason]}</span>
          </span>
        </Field>
        <Field label="Enlace vence">{formatDate(claim.expiresAt)}</Field>
      </Card>

      {claim.institutionClaimed && claim.state !== 'approved' && (
        <p className="border-border bg-card-alt text-body rounded-md border p-3 text-sm">
          Esta institución ya está reclamada por otra persona. No se puede aprobar esta solicitud
          sin quitar antes el reclamo actual.
        </p>
      )}

      {decidable ? (
        <ClaimDecision claimId={claim.id} />
      ) : (
        <p className="text-muted text-sm">
          {claim.state === 'awaiting_claimant'
            ? 'El enlace ya está en camino. No hay nada que decidir hasta que venza o lo usen.'
            : 'Esta solicitud ya está resuelta.'}
        </p>
      )}

      {!hasRole(user, ['admin']) && (
        <p className="text-faint text-xs">
          Aprobar o rechazar un reclamo requiere una cuenta admin.
        </p>
      )}

      <a
        href={`/universidades/${claim.institutionSlug}`}
        className="text-body hover:text-ink text-sm underline underline-offset-2"
      >
        Ver el perfil público
      </a>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-faint text-xs">{label}</span>
      <span className="text-body text-sm">{children}</span>
    </div>
  );
}
