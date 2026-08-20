/**
 * "How much does this carrera cost me" — the total, or the honest gap (PR-48).
 *
 * Sits under the arancel block, because it is the arancel composed rather than
 * a second source of it. Everything here is `total-cost.ts` arithmetic over
 * verified `prices` columns; this component decides layout and nothing else.
 *
 * ### The two claims this file makes, and where they are held
 *
 * 1. **A stale figure never appears without the words rule 3 requires.** The
 *    PR-33 warning rides on the total itself and not only on the arancel above
 *    it — a stale cuota multiplied by five years is a stale number five times
 *    over, and it is the number a family will budget against.
 * 2. **A partial shows no figure at all.**
 *
 * Neither is a comment: `TotalCostBlock.test.ts` renders this component with
 * `renderToStaticMarkup` and asserts both against the emitted HTML. That is
 * why the block reads its warning from `staleSuffix()` rather than deciding it
 * inline — the decision is testable, the JSX is not.
 *
 * ### It names its sede
 *
 * The programme page picks `offerings[0]` for its aside, and two sedes of one
 * carrera can charge different aranceles. So this block says which sede its
 * number belongs to, and `OfferingsBlock` carries the per-sede totals.
 */

import { Card } from '@/components/ui';
import { copy } from '@/lib/copy';
import { formatMoney } from '@/lib/format';
import { totalCost } from '@/lib/prices/total-cost';
import { staleSuffix, totalCostLabel, yearsLabel } from '@/lib/prices/total-cost-display';
import type { OfferingSummary, PriceSummary } from '@/lib/search';

/**
 * Which sede this block should name, given the carrera's offerings.
 *
 * The aside shows `offerings[0]`, so with more than one sede the figure belongs
 * to a particular one and has to say which; with a single sede the label would
 * be noise. It lives here rather than inline in the page because a gate written
 * inline in an async server component is a gate no test can reach — deleting it
 * left the whole suite green (PR-48b).
 */
export function totalCostScope(
  offerings: readonly Pick<OfferingSummary, 'campusName'>[],
): string | undefined {
  return offerings.length > 1 ? offerings[0]?.campusName : undefined;
}

export function TotalCostBlock({
  price,
  durationMonths,
  campusName,
}: {
  price: PriceSummary;
  durationMonths: number | null;
  /** Named on the card: this total is one sede's, not the carrera's average. */
  campusName?: string;
}) {
  const total = totalCost(price, durationMonths);
  const warning = staleSuffix(total);
  const years = yearsLabel(total);
  const complete = total.kind === 'complete';

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-ink text-base font-semibold">{copy.totalCost.heading}</h2>
        {campusName && (
          <p className="text-muted text-xs">{copy.totalCost.scopeLabel(campusName)}</p>
        )}
      </div>

      {warning && (
        <p
          role="note"
          className="border-warn/40 bg-warn-bg text-warn rounded-md border px-3 py-2 text-sm font-medium"
        >
          {warning}
        </p>
      )}

      {complete ? (
        <>
          <p className="text-ink font-mono text-2xl font-semibold">{totalCostLabel(total)}</p>
          {total.isFree && <p className="text-body text-sm">{copy.totalCost.freeNote}</p>}
          {!total.isFree && total.total === 0 && (
            <p className="text-body text-sm">{copy.totalCost.zeroNote}</p>
          )}
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
