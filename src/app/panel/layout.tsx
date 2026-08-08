import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Footer } from '@/components/layout/Footer';
import { hasRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** A session is per-request. Nothing under /panel may be prerendered. */
export const dynamic = 'force-dynamic';

/**
 * The institution gate.
 *
 * Unlike `/admin`, a signed-out visitor here is *redirected to sign in* rather
 * than 404'd: `/panel` is advertised publicly to institutions, so its existence
 * is not a secret and pretending otherwise would only confuse the people it is
 * for.
 *
 * This guards the shell. It does not scope any data — that is
 * `scopeToInstitution(user)`, called by each query in PR-21, so that an
 * institution reads its own rows and no others.
 */
export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  if (!user) redirect('/ingresar');
  if (!hasRole(user, ['institution_editor']) && !hasRole(user, ['editor'])) redirect('/ingresar');

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
