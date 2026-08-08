import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Footer } from '@/components/layout/Footer';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** A session is per-request. Nothing under /admin may be prerendered. */
export const dynamic = 'force-dynamic';

/**
 * The staff gate.
 *
 * A layout guard is a backstop, not the access control: PR-19's mutations each
 * call `requireRole` themselves, because a server action is reachable without
 * ever rendering this layout (CLAUDE.md rule 4 — hidden buttons are UX).
 *
 * A visitor without the role gets 404, not 403. "This exists but you may not
 * see it" is itself information about an admin surface.
 */
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
