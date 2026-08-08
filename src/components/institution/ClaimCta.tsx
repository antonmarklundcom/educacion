/**
 * "¿Es tu institución?" — the entry point to the claim flow (PR-22).
 *
 * A server component and a plain link; the form is a page of its own, so
 * nothing on the public profile has to become interactive to offer this.
 *
 * The button is `secondary`. CLAUDE.md rule 7 reserves the accent for primary
 * CTAs, and the primary CTA on an institution profile belongs to the student —
 * "Solicitar info" — not to the institution's marketing office.
 *
 * It disappears once the profile is claimed rather than turning into "ya
 * reclamado": who administers an account is not information a public page owes
 * anybody, and a visible dead-end invites people to try their luck.
 */

import { Button } from '@/components/ui';

export function ClaimCta({
  institutionSlug,
  isClaimed,
}: {
  institutionSlug: string;
  isClaimed: boolean;
}) {
  if (isClaimed) return null;

  return (
    <div className="border-border bg-card-alt flex flex-col gap-3 rounded-lg border p-5">
      <h2 className="text-ink text-base font-semibold">¿Es tu institución?</h2>
      <p className="text-muted text-sm">
        Hacete cargo del perfil para corregir los datos, cargar aranceles y convocatorias, y recibir
        las solicitudes de los estudiantes.
      </p>
      <Button href={`/universidades/${institutionSlug}/reclamar`} variant="secondary">
        Reclamá este perfil
      </Button>
    </div>
  );
}
