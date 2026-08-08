import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { currentUser } from '@/lib/auth/session';
import { ChangePasswordForm } from './ChangePasswordForm';

export const metadata: Metadata = {
  title: 'Cambiar contraseña',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const user = await currentUser();
  if (!user) redirect('/ingresar');

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-ink text-2xl font-semibold">Cambiar contraseña</h1>
        <p className="text-body text-sm">
          {user.mustChangePassword
            ? 'Tu contraseña es temporal. Elegí una nueva para seguir.'
            : 'Elegí una contraseña nueva para tu cuenta.'}
        </p>
      </div>

      <ChangePasswordForm minLength={MIN_PASSWORD_LENGTH} />

      <p className="text-faint text-xs">
        Mínimo {MIN_PASSWORD_LENGTH} caracteres. No pedimos mayúsculas ni símbolos: una frase larga
        es más segura y más fácil de recordar.
      </p>
    </main>
  );
}
