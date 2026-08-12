/**
 * The arancel, with its provenance — and with the gap explained when there is
 * one.
 *
 * ### What PR-33 changed
 *
 * A price older than twelve months used to arrive here with every amount
 * stripped, and this block said "no lo mostramos porque tiene más de 12 meses".
 * The policy is reversed (CLAUDE.md rule 3): the amounts arrive, and the block
 * shows them **under a warning banner** that names the month they are from and
 * tells the reader to confirm before deciding. The banner is above the numbers,
 * not below them, for the obvious reason.
 *
 * Nothing here is computed from anything: no "desde", no estimated annual total
 * where the index has none, no currency conversion.
 */

import { staleNotice } from '@/components/browse/price';
import { Card } from '@/components/ui';
import { formatMoney, formatMonthYear } from '@/lib/format';
import type { PriceSummary } from '@/lib/search';

export function PriceBlock({ price }: { price: PriceSummary }) {
  const stale = staleNotice(price);

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-ink text-base font-semibold">Arancel</h2>

      {stale && (
        <p
          role="note"
          className="border-warn/40 bg-warn-bg text-warn rounded-md border px-3 py-2 text-sm font-medium"
        >
          {stale}
        </p>
      )}

      {price.hasAmount && price.currency ? (
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
            Todavía no tenemos ningún arancel cargado para esta carrera.
          </p>
        </div>
      )}

      {price.hasAmount && (
        <p className="text-faint border-border border-t pt-2 text-xs">
          {price.verifiedAt
            ? `Última actualización: ${formatMonthYear(price.verifiedAt)}.`
            : 'No tenemos registro de cuándo se verificó este arancel.'}
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
