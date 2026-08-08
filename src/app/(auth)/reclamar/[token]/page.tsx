/**
 * `/reclamar/[token]` — where a claim link lands (PR-22).
 *
 * ### This page reads and never writes
 *
 * Mail providers, corporate scanners and chat previewers fetch URLs out of
 * messages before a human sees them. A GET that consumed the token would burn
 * every claim link on delivery, and the university would be told their brand
 * new link was already used. So the token is only *looked up* here; it is spent
 * by the POST the form makes.
 *
 * ### The token stays out of the referrer
 *
 * `referrer: 'no-referrer'` on this page, because the token is in the path and
 * any outbound link or asset would otherwise hand it to a third party. There
 * are no third-party assets on this site today; the header is what keeps that
 * true if one ever arrives.
 *
 * Every failure state — unknown, used, expired, still in review, institution
 * already claimed — is rendered as its own sentence. This is not an
 * authentication form, so a uniform "algo salió mal" would only produce support
 * mail; the person holding the link needs to know whether to wait, to ask
 * again, or to write to us.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { Card } from '@/components/ui';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { previewClaim } from '@/lib/claims';

import { ClaimCompleteForm } from './ClaimCompleteForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reclamá el perfil de tu institución',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

type Params = Promise<{ token: string }>;

const FAILURES: Record<string, { title: string; body: string }> = {
  unknown: {
    title: 'Ese enlace no es válido',
    body: 'Puede que se haya cortado al copiarlo. Pedí el reclamo de nuevo desde el perfil de tu institución.',
  },
  used: {
    title: 'Ese enlace ya fue usado',
    body: 'Los enlaces de reclamo sirven una sola vez. Si ya completaste el reclamo, entrá con tu correo y contraseña.',
  },
  expired: {
    title: 'Ese enlace venció',
    body: 'Los enlaces duran 72 horas. Pedí el reclamo otra vez desde el perfil de tu institución y te mandamos uno nuevo.',
  },
  awaiting_review: {
    title: 'Tu solicitud está en revisión',
    body: 'Todavía la estamos revisando. Te escribimos apenas la resolvamos.',
  },
  already_claimed: {
    title: 'Ese perfil ya fue reclamado',
    body: 'Alguien de la institución ya está a cargo. Pedile que te invite desde su panel, o escribinos.',
  },
};

export default async function ClaimTokenPage({ params }: { params: Params }) {
  const { token } = await params;
  const result = await previewClaim(token);

  if (!result.ok) {
    const failure = FAILURES[result.state] ?? FAILURES.unknown;
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16">
        <Card className="flex flex-col gap-2">
          <h1 className="text-ink text-xl font-semibold">{failure.title}</h1>
          <p className="text-body text-sm">{failure.body}</p>
          <Link
            href="/universidades"
            className="text-body hover:text-ink text-sm underline underline-offset-2"
          >
            Ir al listado de instituciones
          </Link>
        </Card>
      </main>
    );
  }

  const { institutionName, email, needsPassword } = result.preview;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-ink text-2xl font-semibold">Reclamá {institutionName}</h1>
        <p className="text-body text-sm">
          Verificamos que controlás <strong>{email}</strong>. Confirmá abajo y quedás como
          administrador del perfil de {institutionName}.
        </p>
      </div>

      <ClaimCompleteForm
        token={token}
        email={email}
        needsPassword={needsPassword}
        minPasswordLength={MIN_PASSWORD_LENGTH}
      />

      <p className="text-faint text-xs">
        Este enlace sirve una sola vez. Si no fuiste vos quien lo pidió, cerrá esta página y
        escribinos.
      </p>
    </main>
  );
}
