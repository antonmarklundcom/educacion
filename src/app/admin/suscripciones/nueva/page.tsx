import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { Button, Select } from '@/components/ui';
import { listPlans } from '@/db/queries/plans';
import { listInstitutionsForBilling } from '@/db/queries/subscriptions';
import { getInstitutionClaimState } from '@/lib/claims';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { createSubscriptionAction } from '../actions';
import { subscriptionFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Two steps, like the arancel form: pick the institution, then the plan.
 *
 * The institution list marks which profiles are claimed, because an unclaimed
 * one cannot be given a plan (`architecture.md` §16.5) — a subscription hands
 * somebody a badge, a lead inbox and a panel, and an unclaimed institution has
 * nobody to hand them to. The refusal is enforced in `createSubscription`; the
 * label here is so the operator finds out before typing an invoice reference.
 */
export default async function NewSubscriptionPage({
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
  const raw = params.institucion;
  const institutionId = Number(Array.isArray(raw) ? raw[0] : raw) || null;

  if (!institutionId) {
    const institutions = await listInstitutionsForBilling(user);
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
        <h1 className="text-ink text-2xl font-bold">Activá un plan</h1>
        <form method="GET" className="flex flex-col gap-4">
          <Select id="institucion" name="institucion" label="¿Para qué institución?" required>
            <option value="">Seleccioná…</option>
            {institutions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.nameShort}
                {option.claimed ? '' : ' — sin reclamar'}
              </option>
            ))}
          </Select>
          <div>
            <Button type="submit">Seguí</Button>
          </div>
        </form>
      </main>
    );
  }

  const [plans, claim] = await Promise.all([listPlans(), getInstitutionClaimState(institutionId)]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Activá un plan</h1>

      {!claim.claimed && (
        <p className="border-warn/40 bg-warn-bg text-body rounded-md border px-4 py-3 text-sm">
          Esta institución todavía no reclamó su perfil, así que no hay a quién entregarle el panel
          ni las solicitudes. Aprobá el reclamo en <strong>/admin/reclamos</strong> antes de activar
          el plan.
        </p>
      )}

      {plans.length === 0 ? (
        <p className="border-border bg-card-alt text-body rounded-md border px-4 py-6 text-sm">
          No hay planes cargados. Corré <code>npm run seed:plans</code> con el DATABASE_URL de
          producción.
        </p>
      ) : (
        <AdminForm
          fields={subscriptionFields(plans)}
          defaultValues={{ status: 'active' }}
          action={createSubscriptionAction.bind(null, institutionId)}
          submitLabel="Activá la suscripción"
          cancelHref="/admin/suscripciones"
        />
      )}
    </main>
  );
}
