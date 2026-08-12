'use client';

/**
 * Client component justification (CLAUDE.md rule 6): same as `LeadStatusForm`
 * — `useActionState` reports the dispute's outcome ("enviamos tu disputa" or
 * a validation error) beside the accreditation row it was filed against,
 * without a navigation that would lose the rest of the carrera page.
 */

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Textarea } from '@/components/ui';
import { fileAccreditationDisputeAction, type PanelFormState } from '@/app/panel/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? 'Enviando…' : 'Enviar disputa'}
    </Button>
  );
}

export function AccreditationDisputeForm({
  accreditationId,
  programId,
}: {
  accreditationId: number;
  programId: number;
}) {
  const [open, setOpen] = useState(false);
  const action = fileAccreditationDisputeAction.bind(null, accreditationId, programId);
  const [state, formAction] = useActionState<PanelFormState, FormData>(action, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-danger text-sm font-medium underline underline-offset-4"
      >
        Disputar
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Textarea
        name="reason"
        rows={3}
        required
        minLength={10}
        placeholder="Contanos qué está mal en este registro y por qué."
        className="min-h-24 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink"
      />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted text-sm hover:underline"
        >
          Cancelar
        </button>
      </div>
      {state.error && (
        <p role="alert" className="bg-danger/10 text-danger rounded-md px-3 py-2 text-sm">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="border-ok/40 bg-ok-bg text-body rounded-md border px-3 py-2 text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}
