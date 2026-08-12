'use client';

/**
 * Client component justification (CLAUDE.md rule 6): the link comes back in the
 * action's result and has to be rendered without a navigation — `useActionState`
 * is what holds it. A server-rendered version would have to put the token in a
 * URL or in a cookie, which are the two places a one-time credential must not
 * go.
 */

import { useActionState } from 'react';

import { Button } from '@/components/ui';

import { issueAccessLinkAction, type AccessLinkState } from './actions';

export function AccessLinkButton({ userId, email }: { userId: number; email: string }) {
  const action = issueAccessLinkAction.bind(null, userId);
  const [state, formAction] = useActionState<AccessLinkState, FormData>(action, {});

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <Button type="submit" variant="secondary">
          {state.url ? 'Generar otro' : 'Generar enlace'}
        </Button>
      </form>

      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}

      {state.url && (
        <div className="border-border bg-card-alt flex w-full flex-col gap-2 rounded-md border px-4 py-3">
          <p className="text-muted text-sm">
            Pasale este enlace a <span className="text-ink font-medium">{email}</span> por WhatsApp
            o por teléfono. Sirve una sola vez y vence el {state.expiresLabel}.{' '}
            <span className="text-ink font-medium">
              No se vuelve a mostrar: si lo perdés, generá otro.
            </span>
          </p>
          <input
            readOnly
            value={state.url}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Enlace de acceso"
            className="border-border-strong bg-surface text-ink min-h-11 w-full rounded-md border px-3 font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}
