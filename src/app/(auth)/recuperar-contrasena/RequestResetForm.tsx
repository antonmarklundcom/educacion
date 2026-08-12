'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` shows the
 * neutral confirmation and the rate-limit refusal in place, without losing the
 * address that was typed, and `useFormStatus` disables the button while the
 * mail is sent so an impatient double-click does not mint two tokens.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Input } from '@/components/ui';

import { requestResetAction, type RequestResetState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Enviando…' : 'Enviame el enlace'}
    </Button>
  );
}

export function RequestResetForm() {
  const [state, formAction] = useActionState<RequestResetState, FormData>(requestResetAction, {});

  if (state.message) {
    return (
      <p role="status" className="border-border bg-card-alt text-body rounded-md border px-4 py-3 text-sm">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <p role="alert" className="bg-danger/10 text-danger rounded-md px-4 py-3 text-sm">
          {state.error}
        </p>
      )}
      <Input
        id="email"
        name="email"
        type="email"
        label="Tu correo"
        autoComplete="email"
        required
      />
      <SubmitButton />
    </form>
  );
}
