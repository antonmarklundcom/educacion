import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui';
import { listPastDue, listUpcomingRenewals, revenueSummary } from '@/db/queries/billing';
import { pastDueGraceDays } from '@/lib/entitlements';
import { daysUntil, type RenewalSubscription } from '@/lib/billing/renewals';
import { asuncionToday, formatGs } from '@/lib/format';
import { REMINDER_THRESHOLDS } from '@/lib/billing/config';
import { CONTACT_EMAIL } from '@/lib/legal/contact';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The furthest renewal notice, so the pipeline shows everything the cron will. */
const HORIZON_DAYS = 90;

function RenewalRow({ subscription, today }: { subscription: RenewalSubscription; today: string }) {
  const daysLeft = subscription.endsOn ? daysUntil(subscription.endsOn, today) : null;
  return (
    <tr className="border-border border-b last:border-0">
      <td className="text-body px-4 py-3">
        <Link
          href={`/admin/suscripciones/${subscription.id}`}
          className="text-ink underline underline-offset-4"
        >
          {subscription.institutionName}
        </Link>
      </td>
      <td className="text-muted px-4 py-3">{subscription.planName}</td>
      <td className="text-body px-4 py-3 font-mono">{subscription.endsOn}</td>
      <td className="text-body px-4 py-3 text-right font-mono">
        {daysLeft != null ? daysLeft : '—'}
      </td>
      <td className="text-muted px-4 py-3">{subscription.invoiceRef ?? 'sin factura'}</td>
    </tr>
  );
}

/**
 * `/admin/facturacion` — what is sold, what is about to end and what is unpaid.
 *
 * The numbers are deliberately labelled **contratado**, not cobrado: this app
 * does not know whether a transferencia arrived. `monetization.md` §5 keeps
 * invoicing in FacturaPY and stores only the reference and the guaraní amount
 * here, so "USD contratado" is the sum of list prices for subscriptions the
 * site is currently honouring, and the guaraní column is what was actually
 * invoiced.
 */
export default async function AdminBillingPage() {
  const user = await currentUser();
  try {
    requireRole(user, ['admin']);
  } catch {
    notFound();
  }

  const today = asuncionToday();
  const graceDays = pastDueGraceDays();

  const [summary, upcoming, pastDue] = await Promise.all([
    revenueSummary(user, today),
    listUpcomingRenewals(user, today, HORIZON_DAYS),
    listPastDue(user),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Facturación</h1>
        <p className="text-muted max-w-prose text-sm">
          Lo que está vendido hoy, lo que vence pronto y lo que quedó sin pagar. Los importes en
          dólares son <strong>contratado</strong>, no cobrado: la factura se emite en FacturaPY y
          acá queda su referencia. Los números de abajo cuentan solo suscripciones{' '}
          <strong>activas a un plan con precio</strong> — una prueba no debe nada y un plan gratis
          no se factura, así que ninguna de las dos suma acá.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-ink text-lg font-semibold">Contratado hoy</h2>
        <div className="border-border overflow-x-auto rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-border bg-card-alt border-b text-left">
                <th className="text-muted px-4 py-3 font-medium">Plan</th>
                <th className="text-muted px-4 py-3 text-right font-medium">Instituciones</th>
                <th className="text-muted px-4 py-3 text-right font-medium">Precio de lista</th>
                <th className="text-muted px-4 py-3 text-right font-medium">USD/año contratado</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted px-4 py-6">
                    Todavía no hay ninguna suscripción contratada.
                  </td>
                </tr>
              ) : (
                summary.rows.map((row) => (
                  <tr key={row.planCode} className="border-border border-b last:border-0">
                    <td className="text-body px-4 py-3">{row.planName}</td>
                    <td className="text-body px-4 py-3 text-right font-mono">{row.activeCount}</td>
                    <td className="text-muted px-4 py-3 text-right font-mono">
                      {row.priceUsdYear.toLocaleString('es-PY')}
                    </td>
                    <td className="text-ink px-4 py-3 text-right font-mono font-semibold">
                      {row.contractedUsdYear.toLocaleString('es-PY')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-border bg-surface flex flex-col gap-1 rounded-md border p-4">
            <dt className="text-muted text-xs">USD/año contratado</dt>
            <dd className="text-ink font-mono text-xl font-semibold">
              {summary.totalUsdYear.toLocaleString('es-PY')}
            </dd>
          </div>
          <div className="border-border bg-surface flex flex-col gap-1 rounded-md border p-4">
            <dt className="text-muted text-xs">Facturado en guaraníes</dt>
            <dd className="text-ink font-mono text-xl font-semibold">
              {formatGs(summary.invoicedPyg)}
            </dd>
          </div>
          <div className="border-border bg-surface flex flex-col gap-1 rounded-md border p-4">
            <dt className="text-muted text-xs">En prueba</dt>
            <dd className="text-ink font-mono text-xl font-semibold">{summary.trials}</dd>
          </div>
          <div className="border-border bg-surface flex flex-col gap-1 rounded-md border p-4">
            <dt className="text-muted text-xs">Contratadas sin referencia de factura</dt>
            <dd className="text-ink font-mono text-xl font-semibold">
              {summary.missingInvoiceRef}
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-ink text-lg font-semibold">
          Vencen en los próximos {HORIZON_DAYS} días
        </h2>
        <p className="text-muted max-w-prose text-sm">
          El cron manda un aviso a <span className="font-mono">{CONTACT_EMAIL}</span> a los{' '}
          {new Intl.ListFormat('es-PY').format(
            [...REMINDER_THRESHOLDS].sort((a, b) => b - a).map(String),
          )}{' '}
          días. Se manda{' '}
          <strong>uno solo</strong> por período —el umbral más cercano que todavía sea cierto—; al
          renovar se vuelven a armar.
        </p>
        {upcoming.length === 0 ? (
          <p className="border-border bg-card-alt text-muted rounded-md border px-4 py-6 text-sm">
            Nada vence en los próximos {HORIZON_DAYS} días.
          </p>
        ) : (
          <div className="border-border overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-border bg-card-alt border-b text-left">
                  <th className="text-muted px-4 py-3 font-medium">Institución</th>
                  <th className="text-muted px-4 py-3 font-medium">Plan</th>
                  <th className="text-muted px-4 py-3 font-medium">Vence</th>
                  <th className="text-muted px-4 py-3 text-right font-medium">Días</th>
                  <th className="text-muted px-4 py-3 font-medium">Factura</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((subscription) => (
                  <RenewalRow key={subscription.id} subscription={subscription} today={today} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-ink text-lg font-semibold">Vencidas sin pago</h2>
          {summary.pastDue > 0 && <Badge tone="warn">{summary.pastDue}</Badge>}
        </div>
        <p className="text-muted max-w-prose text-sm">
          Una suscripción vencida conserva sus funciones {graceDays}{' '}
          {graceDays === 1 ? 'día' : 'días'} (<span className="font-mono">BILLING_GRACE_DAYS</span>
          ). Pasado eso deja de contar sola: no hay que cancelar nada para que las funciones se
          apaguen, y cancelar es una decisión comercial que no toma ningún cron.
        </p>
        {pastDue.length === 0 ? (
          <p className="border-border bg-card-alt text-muted rounded-md border px-4 py-6 text-sm">
            No hay suscripciones vencidas sin pago.
          </p>
        ) : (
          <div className="border-border overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-border bg-card-alt border-b text-left">
                  <th className="text-muted px-4 py-3 font-medium">Institución</th>
                  <th className="text-muted px-4 py-3 font-medium">Plan</th>
                  <th className="text-muted px-4 py-3 font-medium">Venció</th>
                  <th className="text-muted px-4 py-3 text-right font-medium">Días</th>
                  <th className="text-muted px-4 py-3 font-medium">Factura</th>
                </tr>
              </thead>
              <tbody>
                {pastDue.map((subscription) => (
                  <RenewalRow key={subscription.id} subscription={subscription} today={today} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
