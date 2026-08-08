'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` reports
 * how many rows were stamped, and the refusals — nothing selected, over 200 —
 * without a navigation that would clear the checkboxes the operator has been
 * ticking down a list of fifty.
 *
 * The wording is load-bearing and lives here rather than in the query module,
 * because this is where a person reads it. Bulk verify does not re-check
 * anything; it records that **you** say these are still true, dated and
 * attributed. Nothing is pre-selected for exactly that reason.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui';
import { formatDate, formatGs } from '@/lib/format';

export interface BulkVerifyState {
  error?: string;
  message?: string;
}

export interface VerifiableRow {
  id: number;
  institutionShort: string;
  programName: string;
  campusName: string;
  monthlyFee: number | null;
  annualCost: number | null;
  isFree: boolean;
  verifiedAt: Date | null;
  sourceUrl: string | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Guardando…' : 'Confirmo que estos siguen vigentes'}
    </Button>
  );
}

export function BulkVerifyForm({
  rows,
  action,
}: {
  rows: VerifiableRow[];
  action: (state: BulkVerifyState, formData: FormData) => Promise<BulkVerifyState>;
}) {
  const [state, formAction] = useActionState<BulkVerifyState, FormData>(action, {});

  if (rows.length === 0) {
    return (
      <p className="border-border bg-card-alt text-muted rounded-md border px-4 py-6 text-sm">
        No hay aranceles vencidos. Nada que reverificar hoy.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="tabla" value="prices" />

      <p className="border-border bg-card-alt text-body rounded-md border px-4 py-3 text-sm">
        Marcar acá no vuelve a leer ninguna fuente: queda registrado que{' '}
        <strong className="font-semibold">vos</strong> confirmaste, con fecha y nombre, que cada
        arancel marcado sigue siendo el vigente. Marcá solo lo que acabás de comprobar.
      </p>

      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.id}>
            <label className="border-border hover:bg-card-alt flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
              <input
                type="checkbox"
                name="id"
                value={row.id}
                className="border-border-strong accent-ink mt-0.5 size-5 rounded"
              />
              <span className="min-w-0 flex-1">
                <span className="text-ink font-medium">{row.institutionShort}</span>{' '}
                <span className="text-body">{row.programName}</span>
                <span className="text-faint block text-xs">
                  {row.campusName} ·{' '}
                  {row.isFree
                    ? 'Gratuita'
                    : row.annualCost != null
                      ? `${formatGs(row.annualCost)} al año`
                      : 'Sin costo anual calculable'}{' '}
                  ·{' '}
                  {row.verifiedAt ? `verificado ${formatDate(row.verifiedAt)}` : 'nunca verificado'}
                </span>
              </span>
              {row.sourceUrl && (
                <a
                  href={row.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink shrink-0 text-xs underline underline-offset-4"
                >
                  fuente
                </a>
              )}
            </label>
          </li>
        ))}
      </ul>

      {state.error && (
        <p role="alert" className="bg-danger/10 text-danger rounded-md px-4 py-3 text-sm">
          {state.error}
        </p>
      )}
      {state.message && <p className="text-ok text-sm">{state.message}</p>}

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
