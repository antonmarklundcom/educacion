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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (user) redirect(user.role === 'admin' || user.role === 'editor' ? '/admin' : '/panel');

  const justReset = (await searchParams).restablecida === '1';

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">Ingresar</h1>
        <p className="text-sm text-body">Accedé al panel de tu institución o al admin.</p>
      </div>

      {justReset ? (
        <p role="status" className="text-body text-sm">
          Tu contraseña fue actualizada. Ingresá con la nueva.
        </p>
      ) : null}

      <LoginForm />

      <Link
        href="/recuperar"
        className="text-muted hover:text-ink text-sm underline underline-offset-4"
      >
        Olvidé mi contraseña
      </Link>
    </main>
  );
}
