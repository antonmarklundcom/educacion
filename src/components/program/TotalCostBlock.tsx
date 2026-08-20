/**
 * "How much does this carrera cost me" — the total, or the honest gap (PR-48).
 *
 * Sits under the arancel block, because it is the arancel composed rather than
 * a second source of it. Everything here is `total-cost.ts` arithmetic over
 * verified `prices` columns; this component decides layout and nothing else.
 *
 * The PR-33 warning rides on the total itself and not only on the breakdown:
 * a stale cuota multiplied by five years is a stale number five times over,
 * and it is the number a family will budget against (CLAUDE.md rule 3).
 */

import { staleNotice } from '@/components/browse/price';
import { Card } from '@/components/ui';
import { copy } from '@/lib/copy';
import { formatMoney } from '@/lib/format';
import { totalCost } from '@/lib/prices/total-cost';
import { totalCostLabel, yearsLabel } from '@/lib/prices/total-cost-display';
import type { PriceSummary } from '@/lib/search';

export function TotalCostBlock({
  price,
  durationMonths,
}: {
  price: PriceSummary;
  durationMonths: number | null;
}) {
  const total = totalCost(price, durationMonths);
  const stale = staleNotice(price);
  const years = yearsLabel(total);

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-ink text-base font-semibold">{copy.totalCost.heading}</h2>

      {stale && total.kind === 'complete' && (
        <p
          role="note"
          className="border-warn/40 bg-warn-bg text-warn rounded-md border px-3 py-2 text-sm font-medium"
        >
          {stale}
        </p>
      )}

      {total.kind === 'complete' ? (
        <>
          <p className="text-ink font-mono text-2xl font-semibold">{totalCostLabel(total)}</p>
          {total.isFree && <p className="text-body text-sm">{copy.totalCost.freeNote}</p>}
          <dl className="flex flex-col gap-2">
            {years && <Line label={copy.totalCost.breakdown.duration} value={years} />}
            {!total.isFree && total.annualCost != null && total.currency && (
              <Line
                label={copy.totalCost.breakdown.annual}
                value={formatMoney(total.annualCost, total.currency)}
              />
            )}
            {!total.isFree && total.installments != null && (
              <Line
                label={copy.totalCost.breakdown.installments}
                value={String(total.installments)}
              />
            )}
            {total.admissionFee != null && total.currency && (
              <Line
                label={copy.totalCost.breakdown.admissionFee}
                value={formatMoney(total.admissionFee, total.currency)}
              />
            )}
          </dl>
        </>
      ) : (
        <p className="text-body text-sm">{totalCostLabel(total)}</p>
      )}

      <p className="text-faint border-border border-t pt-2 text-xs">{copy.totalCost.scopeNote}</p>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border flex items-baseline justify-between gap-4 border-b pb-2 last:border-0 last:pb-0">
      <dt className="text-body text-sm">{label}</dt>
      <dd className="text-ink font-mono text-sm">{value}</dd>
    </div>
  );
}
