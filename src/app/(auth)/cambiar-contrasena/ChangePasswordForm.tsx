'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` renders
 * the action's validation message without a navigation, and `useFormStatus`
 * disables submit while the two scrypt derivations run. No rule about what
 * makes a password acceptable lives here — `passwordProblem` decides, on the
 * server, so the browser cannot be talked out of it.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Input } from '@/components/ui';
import { changePasswordAction, type ChangePasswordState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Guardando…' : 'Guardar contraseña'}
    </Button>
  );
}

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const [state, formAction] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        id="current"
        name="current"
        type="password"
        label="Contraseña actual"
        autoComplete="current-password"
        required
      />
      <Input
        id="password"
        name="password"
        type="password"
        label="Contraseña nueva"
        autoComplete="new-password"
        minLength={minLength}
        required
      />
      <Input
        id="confirm"
        name="confirm"
        type="password"
        label="Repetí la contraseña nueva"
        autoComplete="new-password"
        minLength={minLength}
        required
      />

      {state.error ? (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
