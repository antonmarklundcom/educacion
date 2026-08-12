'use client';

/**
 * Client component justification (CLAUDE.md rule 6): the same reason
 * `PanelForm` is one — `useActionState` reports the result of a status change
 * beside the form, without a navigation that would lose the rest of the
 * detail page.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Select } from '@/components/ui';
import { setPanelLeadStatusAction, type PanelFormState } from '@/app/panel/actions';
import { PANEL_LEAD_STATUSES, type LeadStatus } from '@/lib/leads/contract';

const LABELS: Record<(typeof PANEL_LEAD_STATUSES)[number], string> = {
  contacted: 'Contactada',
  qualified: 'Calificada',
  discarded: 'Descartada',
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Guardando…' : 'Actualizar estado'}
    </Button>
  );
}

export function LeadStatusForm({
  leadId,
  currentStatus,
}: {
  leadId: number;
  currentStatus: LeadStatus;
}) {
  const action = setPanelLeadStatusAction.bind(null, leadId);
  const [state, formAction] = useActionState<PanelFormState, FormData>(action, {});

  return (
    <form
      action={formAction}
      className="border-border bg-surface flex flex-wrap items-end gap-3 rounded-md border p-4"
    >
      <Select
        id="status"
        name="status"
        label="Estado"
        defaultValue={PANEL_LEAD_STATUSES.includes(currentStatus as never) ? currentStatus : ''}
      >
        {!PANEL_LEAD_STATUSES.includes(currentStatus as never) && (
          <option value="" disabled>
            {currentStatus === 'new' ? 'Nueva' : 'Enviada'}
          </option>
        )}
        {PANEL_LEAD_STATUSES.map((status) => (
          <option key={status} value={status}>
            {LABELS[status]}
          </option>
        ))}
      </Select>
      <SubmitButton />
      {state.error && (
        <p role="alert" className="bg-danger/10 text-danger w-full rounded-md px-3 py-2 text-sm">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="border-ok/40 bg-ok-bg text-body w-full rounded-md border px-3 py-2 text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}
