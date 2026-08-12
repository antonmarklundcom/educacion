'use client';

/**
 * Client component justification (CLAUDE.md rule 6): this form needs
 * `useActionState` to render the server action's error without a full
 * navigation, and `useFormStatus` to disable the submit button while a sign-in
 * is in flight — scrypt takes a moment on purpose, and a form that looks inert
 * gets double-submitted. No authorization logic lives here; the action decides
 * everything and this only renders what it returns.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Input } from '@/components/ui';
import { loginAction, type LoginState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Ingresando…' : 'Ingresar'}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        id="email"
        name="email"
        type="email"
        label="Correo electrónico"
        autoComplete="username"
        required
        autoFocus
      />
      <Input
        id="password"
        name="password"
        type="password"
        label="Contraseña"
        autoComplete="current-password"
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
