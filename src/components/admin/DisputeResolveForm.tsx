'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` shows
 * the refusal inline ("ya fue resuelta", "elegí un resultado") instead of a
 * navigation to a generic error page — the same reason `ConflictResolver`
 * (PR-20's equivalent for import conflicts) is one.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Textarea } from '@/components/ui';
import { resolveDisputeAction, type ResolveDisputeState } from '@/app/admin/disputas/[id]/actions';

/**
 * Two submit buttons, one `name="outcome"` each — the standard HTML pattern
 * for "which button was clicked" without extra state: whichever is the
 * submitter is the one whose `name`/`value` pair reaches `formData`.
 */
function OutcomeButton({
  outcome,
  label,
  primary,
}: {
  outcome: 'corrected' | 'rejected';
  label: string;
  primary?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="outcome"
      value={outcome}
      disabled={pending}
      className={
        primary
          ? 'bg-accent hover:bg-accent-hover inline-flex min-h-12 items-center rounded-md px-5 text-sm font-medium text-white disabled:pointer-events-none disabled:opacity-50'
          : 'border-border-strong bg-surface text-ink hover:bg-card-alt inline-flex min-h-12 items-center rounded-md border px-5 text-sm font-medium disabled:pointer-events-none disabled:opacity-50'
      }
    >
      {pending ? 'Guardando…' : label}
    </button>
  );
}

export function DisputeResolveForm({ id }: { id: number }) {
  const action = resolveDisputeAction.bind(null, id);
  const [state, formAction] = useActionState<ResolveDisputeState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Textarea
        name="notes"
        rows={3}
        placeholder="Notas para el registro (opcional, se ven en el historial)."
        className="border-border-strong bg-surface text-ink min-h-24 w-full rounded-md border px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-3">
        <OutcomeButton outcome="corrected" label="Corregimos el dato" primary />
        <OutcomeButton outcome="rejected" label="El dato estaba bien" />
      </div>
      {state.error && (
        <p role="alert" className="bg-danger/10 text-danger rounded-md px-3 py-2 text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
