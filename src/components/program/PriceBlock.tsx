/**
 * The arancel, with its provenance — and with the gap explained when there is
 * one.
 *
 * The 12-month rule (CLAUDE.md rule 3) is applied upstream: by the time a
 * `PriceSummary` reaches this component, a price older than twelve months has
 * had every amount stripped and only `verifiedAt` survives. That surviving date
 * is the point of this block. "El último dato verificado es de marzo de 2024"
 * is honest provenance and tells the student the number they might find
 * elsewhere is old; showing the number itself would be the violation.
 *
 * Nothing here is computed from anything: no "desde", no estimated annual total
 * where the index has none, no currency conversion.
 */

import { Card } from '@/components/ui';
import { formatMoney, formatMonthYear } from '@/lib/format';
import type { PriceSummary } from '@/lib/search';

export function PriceBlock({ price }: { price: PriceSummary }) {
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-ink text-base font-semibold">Arancel</h2>

      {price.isDisplayable && price.currency ? (
        price.isFree ? (
          <p className="text-ok text-lg font-semibold">Gratuita</p>
        ) : (
          <dl className="flex flex-col gap-2">
            <Line label="Matrícula" amount={price.matricula} currency={price.currency} />
            <Line label="Cuota mensual" amount={price.monthlyFee} currency={price.currency} />
            <Line
              label="Cuotas por año"
              value={price.installmentsPerYear != null ? String(price.installmentsPerYear) : null}
            />
            <Line label="Derecho de examen" amount={price.admissionFee} currency={price.currency} />
            <Line
              label="Costo anual"
              amount={price.annualCost}
              currency={price.currency}
              emphasis
            />
          </dl>
        )
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-body text-sm">Consultá el arancel directamente con la institución.</p>
          <p className="text-muted text-sm">
            {price.verifiedAt
              ? `El último dato que verificamos es de ${formatMonthYear(price.verifiedAt)}. No lo mostramos porque tiene más de 12 meses y los aranceles cambian todos los años.`
              : 'Todavía no tenemos un arancel verificado para esta carrera.'}
          </p>
        </div>
      )}

      {price.isDisplayable && price.verifiedAt && (
        <p className="text-faint border-border border-t pt-2 text-xs">
          Actualizado: {formatMonthYear(price.verifiedAt)}
        </p>
      )}
    </Card>
  );
}

function Line({
  label,
  amount,
  currency,
  value,
  emphasis,
}: {
  label: string;
  amount?: number | null;
  currency?: PriceSummary['currency'];
  value?: string | null;
  emphasis?: boolean;
}) {
  const text = value ?? (amount != null && currency ? formatMoney(amount, currency) : null);

  return (
    <div className="border-border flex items-baseline justify-between gap-4 border-b pb-2 last:border-0 last:pb-0">
      <dt className="text-body text-sm">{label}</dt>
      <dd
        className={
          text == null
            ? 'text-muted text-sm'
            : emphasis
              ? 'text-ink font-mono text-base font-semibold'
              : 'text-ink font-mono text-sm'
        }
      >
        {text ?? 'Sin datos'}
      </dd>
    </div>
  );
}
