import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { currentUser } from '@/lib/auth/session';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Ingresar',
  robots: { index: false, follow: false },
};

/** Sessions are per-request; nothing on this page may be cached or prerendered. */
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(user.role === 'admin' || user.role === 'editor' ? '/admin' : '/panel');

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">Ingresar</h1>
        <p className="text-sm text-body">Accedé al panel de tu institución o al admin.</p>
      </div>

      <LoginForm />

      <p className="text-xs text-faint">
        ¿Olvidaste tu contraseña? Escribinos y te ayudamos a recuperarla.
      </p>
    </main>
  );
}
