import type { Metadata } from 'next';
import Link from 'next/link';

import { RESET_TTL_MINUTES } from '@/lib/auth/reset-token';

import { RequestResetForm } from './RequestResetForm';

export const metadata: Metadata = {
  title: 'Recuperar contraseña',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * `/recuperar-contrasena` — the flow PR-18 deferred and PR-21 §15.4 named as
 * the thing standing between `/panel` and a real institution (PR-35).
 *
 * The page says the same thing for an address that exists and one that does
 * not. That is not politeness: a form that answers differently is a list of
 * who has an account here.
 */
export default function RequestResetPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-ink text-2xl font-semibold">Recuperar contraseña</h1>
        <p className="text-body text-sm">
          Te mandamos un enlace para elegir una nueva. Sirve una sola vez y vence en{' '}
          {RESET_TTL_MINUTES} minutos.
        </p>
      </div>

      <RequestResetForm />

      <p className="text-muted text-sm">
        <Link href="/ingresar" className="text-ink underline underline-offset-4">
          Volver a ingresar
        </Link>
      </p>
    </main>
  );
}
