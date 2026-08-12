import type { FieldDef } from '@/components/admin/AdminForm';
import type { PlanBand } from '@/lib/entitlements';
import { bandLabel } from '@/lib/entitlements';
import { SUBSCRIPTION_STATUS } from '@/db/schema';

const STATUS_LABELS: Record<(typeof SUBSCRIPTION_STATUS)[number], string> = {
  trial: 'Prueba — funciones activas, sin factura',
  active: 'Activa — facturada y al día',
  past_due: 'Vencida sin pago — se degrada al plan gratis',
  cancelled: 'Cancelada — sin funciones desde hoy',
};

function planLabel(plan: PlanBand): string {
  const price =
    plan.priceUsdYear === 0 ? 'sin costo' : `USD ${plan.priceUsdYear.toLocaleString('es-PY')}/año`;
  return `${plan.name} — ${price} · ${bandLabel(plan)}`;
}

/**
 * One field list for activating and for renewing: a renewal is the same row
 * with new dates and a new invoice reference, so a second form would be two
 * places to keep the same rules.
 *
 * The institution is chosen before this form (create) and is not editable
 * afterwards — moving a subscription between institutions would move a badge
 * and a lead inbox with it, so `updateSubscription` refuses to.
 */
export function subscriptionFields(plans: PlanBand[]): FieldDef[] {
  return [
    {
      type: 'select',
      name: 'planId',
      label: 'Plan',
      required: true,
      options: plans.map((plan) => ({ value: String(plan.id), label: planLabel(plan) })),
      placeholder: 'Elegí el plan…',
    },
    {
      type: 'select',
      name: 'status',
      label: 'Estado',
      required: true,
      options: SUBSCRIPTION_STATUS.map((value) => ({ value, label: STATUS_LABELS[value] })),
      placeholder: 'Elegí el estado…',
    },
    { type: 'text', name: 'startsOn', label: 'Inicio del período (AAAA-MM-DD)', required: true },
    {
      type: 'text',
      name: 'endsOn',
      label: 'Fin del período (AAAA-MM-DD) — vacío = sin vencimiento',
    },
    {
      type: 'text',
      name: 'invoiceRef',
      label: 'Referencia de factura (FacturaPY)',
      maxLength: 120,
    },
    {
      type: 'text',
      name: 'invoicedAmountPyg',
      label: 'Monto facturado en guaraníes (entero, sin centavos)',
    },
    { type: 'textarea', name: 'notes', label: 'Notas internas', rows: 3 },
  ];
}
