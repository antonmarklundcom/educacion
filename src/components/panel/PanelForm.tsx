'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` is what
 * lets a save report **two different outcomes at once** — "guardamos esto" and
 * "esto pasó a revisión" — beside the fields it happened to, without a
 * navigation that would discard the rest of the form. That distinction is the
 * whole submit-for-review workflow; losing it to a redirect would make the
 * panel look like it silently ignored half of what the user typed.
 *
 * It also renders `rejected`: fields the panel refused because they are not the
 * institution's to change. Reporting them is deliberate — silently dropping a
 * field we rendered a control for is how a panel teaches its users that saving
 * does not work.
 *
 * No rule lives here. The action authorizes and the split decides; this renders.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui';
import type { PanelFormState } from '@/app/panel/actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Guardando…' : label}
    </Button>
  );
}

export function PanelForm({
  action,
  submitLabel,
  children,
  note,
}: {
  action: (state: PanelFormState, formData: FormData) => Promise<PanelFormState>;
  submitLabel: string;
  children: React.ReactNode;
  note?: string;
}) {
  const [state, formAction] = useActionState<PanelFormState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {note ? (
        <p className="border-border bg-card-alt text-body rounded-md border px-4 py-3 text-sm">
          {note}
        </p>
      ) : null}

      {children}

      {state.error ? (
        <p role="alert" className="bg-danger/10 text-danger rounded-md px-4 py-3 text-sm">
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p className="border-ok/40 bg-ok-bg text-body rounded-md border px-4 py-3 text-sm">
          {state.message}
        </p>
      ) : null}

      {state.rejected?.length ? (
        <p className="text-muted text-sm">
          No guardamos {state.rejected.join(', ')}: esos datos no se editan desde el panel.
          Escribinos si están mal.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
