import type { Metadata } from 'next';
import Link from 'next/link';

import { RecoverForm } from './RecoverForm';

export const metadata: Metadata = {
  title: 'Recuperar contraseña',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function RecoverPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-ink text-2xl font-semibold">Recuperar contraseña</h1>
        <p className="text-body text-sm">
          Poné tu correo y te mandamos un enlace para elegir una contraseña nueva.
        </p>
      </div>

      <RecoverForm />

      <Link href="/ingresar" className="text-muted hover:text-ink text-sm underline underline-offset-4">
        Volver a ingresar
      </Link>
    </main>
  );
}
