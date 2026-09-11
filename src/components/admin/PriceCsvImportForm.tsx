'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState`.
 *
 * The dry run is a table of per-row verdicts that has to appear beside the file
 * the operator just chose, and the confirm button has to re-submit **that same
 * file**. Both of those need the action's return value rendered in place, which
 * is what `useActionState` is for. A redirect-and-render-a-page alternative
 * would mean staging the parsed file server-side — a table, a purge policy and
 * a second thing to get stale — for a screen two people will ever open.
 *
 * It owns no copy and no rules: every string comes from the catalog slice and
 * every verdict is computed server-side. What lives here is the pending state
 * and the two intents.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui';
import { adminImportCopy } from '@/lib/copy/admin-import';
import type { PriceImportReport, PriceImportVerdict } from '@/db/queries/admin/price-import';

export interface PriceImportState {
  error?: string;
  message?: string;
  report?: PriceImportReport;
}

const VERDICT_CLASS: Record<PriceImportVerdict, string> = {
  create: 'text-ok',
  supersede: 'text-body',
  error: 'text-danger',
};

/**
 * `useFormStatus` is per-form, not per-button, so both buttons would otherwise
 * announce themselves as busy during either submit. `intent` rides along as the
 * submitter's own name/value and tells them apart: the clicked one shows its
 * pending label, the other is merely disabled — which is correct, the form is
 * busy either way.
 */
function SubmitButton({
  intent,
  label,
  pendingLabel,
  variant,
  formAction,
}: {
  intent: string;
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
  formAction?: (formData: FormData) => void;
}) {
  const { pending, data } = useFormStatus();
  const isMine = pending && data?.get('intent') === intent;
  return (
    <Button
      type="submit"
      name="intent"
      value={intent}
      variant={variant}
      disabled={pending}
      formAction={formAction}
    >
      {isMine ? pendingLabel : label}
    </Button>
  );
}

function ReportTable({ report }: { report: PriceImportReport }) {
  if (report.rows.length === 0) {
    return <p className="text-muted text-sm">{adminImportCopy.emptyResult}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body text-sm font-medium">
        {adminImportCopy.summary(
          report.counts.create,
          report.counts.supersede,
          report.counts.error,
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="text-muted text-xs uppercase">
              <th className="py-1 pr-3 font-semibold">{adminImportCopy.columns.line}</th>
              <th className="py-1 pr-3 font-semibold">{adminImportCopy.columns.offering}</th>
              <th className="py-1 pr-3 font-semibold">{adminImportCopy.columns.verdict}</th>
              <th className="py-1 font-semibold">{adminImportCopy.columns.detail}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.line} className="border-border border-t align-top">
                <td className="text-muted py-1.5 pr-3 font-mono text-xs">{row.line}</td>
                <td className="text-body py-1.5 pr-3">{row.label}</td>
                <td className={`py-1.5 pr-3 font-medium ${VERDICT_CLASS[row.verdict]}`}>
                  {adminImportCopy.verdicts[row.verdict]}
                </td>
                <td className="text-muted py-1.5">
                  {row.errors.map((error) => (
                    <span key={error} className="block">
                      {error}
                    </span>
                  ))}
                  {row.staleNote && <span className="text-warn block">{row.staleNote}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PriceCsvImportForm({
  dryRunAction,
  applyAction,
}: {
  dryRunAction: (state: PriceImportState, formData: FormData) => Promise<PriceImportState>;
  applyAction: (state: PriceImportState, formData: FormData) => Promise<PriceImportState>;
}) {
  const [state, formAction] = useActionState<PriceImportState, FormData>(dryRunAction, {});
  const [applyState, applyFormAction] = useActionState<PriceImportState, FormData>(applyAction, {});

  // The apply's own report wins once it exists: it is the record of what was
  // actually written, and leaving the preview on screen beside it is how an
  // operator comes away believing a failed row succeeded.
  const shown = applyState.report ?? state.report;
  const error = applyState.error ?? state.error;

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-col items-start gap-3">
        <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
          {adminImportCopy.fileLabel}
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="text-body text-sm"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton
            intent="dry-run"
            label={adminImportCopy.dryRun}
            pendingLabel={adminImportCopy.dryRunPending}
            variant="secondary"
          />
          <SubmitButton
            intent="apply"
            label={adminImportCopy.apply}
            pendingLabel={adminImportCopy.applyPending}
            formAction={applyFormAction}
          />
        </div>
        <p className="text-faint max-w-prose text-xs">{adminImportCopy.applyNote}</p>
      </form>

      {error && <p className="text-danger text-sm">{error}</p>}
      {applyState.message && <p className="text-ok text-sm">{applyState.message}</p>}
      {shown && <ReportTable report={shown} />}
    </div>
  );
}
