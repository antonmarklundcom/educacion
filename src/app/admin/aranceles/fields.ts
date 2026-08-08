import type { FieldDef } from '@/components/admin/AdminForm';
import type { Option } from '@/db/queries/admin/options';
import { CURRENCY, PRICE_SOURCE } from '@/db/schema';

const CURRENCY_LABELS: Record<(typeof CURRENCY)[number], string> = {
  PYG: 'Guaraníes (Gs.)',
  USD: 'Dólares (USD)',
};

/**
 * `data-model.md` §2 is explicit that a USD arancel is comparable only within
 * its own currency — we do not apply an FX rate we would then have to defend —
 * so the label says guaraníes and the currency is a real choice, not a
 * formality.
 */
const SOURCE_LABELS: Record<(typeof PRICE_SOURCE)[number], string> = {
  institucion: 'La institución nos lo pasó',
  relevamiento: 'Relevamiento propio (llamada, visita, WhatsApp)',
  web_publica: 'Publicado en su web',
};

export function priceFields(offeringOptions: Option[]): FieldDef[] {
  return [
    {
      type: 'select',
      name: 'offeringId',
      label: 'Oferta',
      required: true,
      options: offeringOptions.map((o) => ({ value: String(o.id), label: o.label })),
      placeholder: 'Elegí la oferta…',
    },
    {
      type: 'select',
      name: 'currency',
      label: 'Moneda',
      required: true,
      options: CURRENCY.map((value) => ({ value, label: CURRENCY_LABELS[value] })),
    },
    {
      type: 'checkbox',
      name: 'isFree',
      label: 'Es gratuita (universidad pública sin arancel)',
    },
    { type: 'text', name: 'matricula', label: 'Matrícula (entero, sin centavos)' },
    { type: 'text', name: 'monthlyFee', label: 'Cuota mensual' },
    {
      type: 'number',
      name: 'installmentsPerYear',
      label: 'Cuotas por año (normalmente 10 o 12)',
      min: 1,
      max: 24,
    },
    { type: 'text', name: 'admissionFee', label: 'Derecho de examen / CPI' },
    {
      type: 'select',
      name: 'source',
      label: 'Origen del dato',
      required: true,
      options: PRICE_SOURCE.map((value) => ({ value, label: SOURCE_LABELS[value] })),
    },
    { type: 'url', name: 'sourceUrl', label: 'Enlace a la fuente' },
    { type: 'text', name: 'validFrom', label: 'Vigente desde (AAAA-MM-DD)' },
    { type: 'text', name: 'validTo', label: 'Vigente hasta (AAAA-MM-DD)' },
    {
      type: 'textarea',
      name: 'notesMd',
      label: 'Notas ("incluye materiales", "arancel diferenciado por ingreso")',
      rows: 3,
    },
  ];
}
