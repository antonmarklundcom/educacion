import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { currentUser } from '@/lib/auth/session';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Ingresar',
  robots: { index: false, follow: false },
};

/** Sessions are per-request; nothing on this page may be cached or prerendered. */
export const dynamic = 'force-dynamic';

/** What a completed claim (PR-22) says when it hands the claimant to this page. */
const CLAIM_NOTICE: Record<string, string> = {
  listo: 'Listo, el perfil es tuyo. Entrá con tu correo y la contraseña que acabás de elegir.',
  vinculado:
    'Listo, vinculamos la institución a tu cuenta. Entrá con tu correo y la contraseña de siempre.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (user) redirect(user.role === 'admin' || user.role === 'editor' ? '/admin' : '/panel');

  const claimParam = (await searchParams).reclamo;
  const claimNotice = CLAIM_NOTICE[Array.isArray(claimParam) ? claimParam[0] : (claimParam ?? '')];

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-ink text-2xl font-semibold">Ingresar</h1>
        <p className="text-body text-sm">Accedé al panel de tu institución o al admin.</p>
      </div>

      {claimNotice && (
        <p
          role="status"
          className="border-border bg-card-alt text-body rounded-md border p-3 text-sm"
        >
          {claimNotice}
        </p>
      )}

      <LoginForm />

      <p className="text-muted text-sm">
        <Link href="/recuperar-contrasena" className="text-ink underline underline-offset-4">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </main>
  );
}
