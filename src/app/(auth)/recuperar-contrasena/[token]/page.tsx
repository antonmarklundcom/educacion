import type { Metadata } from 'next';
import Link from 'next/link';

import { lookupResetToken } from '@/db/queries/password-reset';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { RESET_TTL_MINUTES } from '@/lib/auth/reset-token';

import { CompleteResetForm } from './CompleteResetForm';

export const metadata: Metadata = {
  title: 'Elegí una nueva contraseña',
  robots: { index: false, follow: false },
  // The token is in the path, so no referrer may carry it to another origin —
  // the same precaution the claim page takes (`architecture.md` §16.4).
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

const REFUSALS: Record<string, string> = {
  used: 'Ese enlace ya se usó. Si fuiste vos, entrá con la contraseña nueva; si no, pedí otro enlace.',
  expired: `Ese enlace venció — duran ${RESET_TTL_MINUTES} minutos. Pedí uno nuevo.`,
  unknown: 'Ese enlace no es válido. Puede estar cortado por el correo: pedí uno nuevo.',
};

/**
 * `/recuperar-contrasena/[token]` (PR-35).
 *
 * The page is a **read**: the token is spent by the POST the form makes, not by
 * opening the link. Mail scanners and link previewers fetch URLs out of
 * messages, and a GET that consumed the token would burn every reset link on
 * delivery — the same trap the claim flow avoids (§16.4).
 */
export default async function CompleteResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { state, email } = await lookupResetToken(token);

  if (state !== 'ok' || !email) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
        <h1 className="text-ink text-2xl font-semibold">Enlace no válido</h1>
        <p className="text-body text-sm">{REFUSALS[state] ?? REFUSALS.unknown}</p>
        <Link
          href="/recuperar-contrasena"
          className="text-ink text-sm font-medium underline underline-offset-4"
        >
          Pedir un enlace nuevo
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-ink text-2xl font-semibold">Elegí una nueva contraseña</h1>
        <p className="text-body text-sm">
          Este enlace sirve una sola vez. Al guardarla, los demás enlaces que hayas pedido dejan de
          funcionar.
        </p>
      </div>

      <CompleteResetForm token={token} email={email} minLength={MIN_PASSWORD_LENGTH} />
    </main>
  );
}
