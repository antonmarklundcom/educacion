'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` +
 * `useFormStatus`. Everything on `/admin/importaciones` is a button that starts
 * something long — an import, a curate pass, a cron job — and the two things an
 * operator needs are the outcome sentence and a button that visibly stops
 * accepting clicks while the request is in flight. Without the pending state a
 * slow trigger looks like a dead button, and a dead-looking button gets clicked
 * again, which is precisely what the run lock exists to survive.
 *
 * It renders the outcome and nothing else — no job list, no schedule, no copy
 * of its own beyond the two states of its label. The page owns what the buttons
 * mean.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui';

export interface ConsoleState {
  error?: string;
  message?: string;
}

function SubmitButton({
  label,
  pendingLabel,
  variant,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function ConsoleActionForm({
  action,
  fields,
  label,
  pendingLabel,
  variant,
  disabled,
  disabledNote,
}: {
  action: (state: ConsoleState, formData: FormData) => Promise<ConsoleState>;
  /** Hidden inputs the action reads — `job`, `id`. */
  fields: Record<string, string>;
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  /** Why the button is disabled. Shown in place of an outcome. */
  disabledNote?: string;
}) {
  const [state, formAction] = useActionState<ConsoleState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton
        label={label}
        pendingLabel={pendingLabel}
        variant={variant}
        disabled={disabled}
      />
      {disabled && disabledNote && <p className="text-muted text-xs">{disabledNote}</p>}
      {state.error && <p className="text-danger text-xs">{state.error}</p>}
      {state.message && <p className="text-ok text-xs">{state.message}</p>}
    </form>
  );
}
