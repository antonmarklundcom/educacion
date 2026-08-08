import type { Metadata } from 'next';
import Link from 'next/link';

import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';
import { RESET_LINK_INVALID } from '@/lib/auth/reset';
import { ResetForm } from './ResetForm';

export const metadata: Metadata = {
  title: 'Elegir una contraseña nueva',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The token is **not validated here.** Checking it on render and again on
 * submit means two places that can disagree, and the render-time check buys
 * nothing: a token can expire between the two. The action is the only judge,
 * and it says the same thing for unknown, expired and spent.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.token;
  const token = Array.isArray(raw) ? raw[0] : raw;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-ink text-2xl font-semibold">Elegí una contraseña nueva</h1>
        <p className="text-body text-sm">Mínimo {MIN_PASSWORD_LENGTH} caracteres.</p>
      </div>

      {token ? (
        <ResetForm token={token} minLength={MIN_PASSWORD_LENGTH} />
      ) : (
        <p role="alert" className="text-danger text-sm">
          {RESET_LINK_INVALID}
        </p>
      )}

      <Link
        href="/recuperar"
        className="text-muted hover:text-ink text-sm underline underline-offset-4"
      >
        Pedir un enlace nuevo
      </Link>
    </main>
  );
}
