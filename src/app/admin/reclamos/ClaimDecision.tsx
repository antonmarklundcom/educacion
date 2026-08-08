'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` keeps the
 * outcome next to the buttons — including "aprobaste pero el correo no salió",
 * which the admin has to act on and which a redirect would swallow.
 *
 * One form, two submit buttons: the decision travels as a form value, so the
 * server action reads it rather than being chosen by which handler the client
 * happened to call. Nothing is decided here.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui';
import { decideClaimAction, type ClaimDecisionState } from './actions';

function Decisions() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-3">
      <Button type="submit" name="decision" value="approve" disabled={pending}>
        {pending ? 'Guardando…' : 'Aprobá y enviá el enlace'}
      </Button>
      <Button type="submit" name="decision" value="reject" variant="secondary" disabled={pending}>
        Rechazá
      </Button>
    </div>
  );
}

export function ClaimDecision({ claimId }: { claimId: number }) {
  const [state, formAction] = useActionState<ClaimDecisionState, FormData>(
    decideClaimAction.bind(null, claimId),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Decisions />

      {state.error ? (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-body text-sm">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
