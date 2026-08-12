import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { listPlans } from '@/db/queries/plans';
import { getSubscriptionForEdit } from '@/db/queries/subscriptions';
import { FEATURE_LABELS, getEntitlements } from '@/lib/entitlements';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { cancelSubscriptionAction, updateSubscriptionAction } from '../actions';
import { subscriptionFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Renewing and correcting are the same form: move the dates forward, put the
 * new invoice reference in, save.
 *
 * Underneath it, what the institution can actually use **right now** — read
 * through the same `getEntitlements` every gated page calls, not recomputed
 * here. If this list and the customer's screen ever disagree, one of them is a
 * bug; showing the real answer next to the row that produces it is how that
 * gets noticed here rather than in a phone call.
 */
export default async function EditSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  try {
    requireRole(user, ['admin']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const subscription = await getSubscriptionForEdit(user, id);
  if (!subscription) notFound();

  const [plans, entitlements] = await Promise.all([
    listPlans(),
    getEntitlements(subscription.institutionId),
  ]);

  const active = Object.entries(entitlements.features)
    .filter(([, enabled]) => enabled)
    .map(([key]) => FEATURE_LABELS[key as keyof typeof FEATURE_LABELS]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">
          Suscripción de {subscription.institutionName}
        </h1>
        <p className="text-muted max-w-prose text-sm">
          Para renovar, movés el período y ponés la nueva referencia de factura. La institución no
          cambia: mover una suscripción de institución movería también la insignia y la bandeja de
          solicitudes.
        </p>
      </div>

      <AdminForm
        fields={subscriptionFields(plans)}
        defaultValues={{ ...subscription }}
        action={updateSubscriptionAction.bind(null, id, subscription.institutionId)}
        submitLabel="Guardá los cambios"
        cancelHref="/admin/suscripciones"
      />

      <section className="border-border flex flex-col gap-2 border-t pt-6">
        <h2 className="text-ink text-lg font-semibold">Qué tiene habilitado hoy</h2>
        <p className="text-muted text-sm">
          Plan efectivo: <strong>{entitlements.planName ?? 'Gratis'}</strong> · estado{' '}
          {entitlements.status}
          {entitlements.currentPeriodEndsOn ? ` · vence ${entitlements.currentPeriodEndsOn}` : ''}
        </p>
        {active.length === 0 ? (
          <p className="text-body text-sm">
            Ninguna función paga. Ve el sitio exactamente como cualquier institución gratuita.
          </p>
        ) : (
          <ul className="text-body flex list-disc flex-col gap-1 pl-5 text-sm">
            {active.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        )}
      </section>

      {subscription.status !== 'cancelled' && (
        <form
          action={cancelSubscriptionAction.bind(null, id)}
          className="border-border border-t pt-6"
        >
          <button type="submit" className="text-danger text-sm underline underline-offset-4">
            Cancelá esta suscripción (las funciones pagas se apagan en el próximo request, la fila
            queda con su factura y su período)
          </button>
        </form>
      )}
    </main>
  );
}
