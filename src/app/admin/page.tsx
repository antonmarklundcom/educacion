import Link from 'next/link';

import { ActivityFeed } from '@/components/admin/ActivityFeed';
import { AdminNav } from '@/components/admin/AdminNav';
import { listActivity } from '@/db/queries/activity-log';
import { countEntities } from '@/db/queries/admin';
import { ADMIN_ENTITIES, ENTITY_DEFS } from '@/lib/admin/entities';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * The admin's front door: how much of each entity exists, and what changed last.
 *
 * Every number here is a `COUNT(*)` over a curated table — a fact about what we
 * have loaded, not an estimate, and it reads as one.
 */
export default async function AdminPage() {
  requireRole(await currentUser(), ['editor']);

  const [counts, activity] = await Promise.all([countEntities(), listActivity({ limit: 25 })]);

  return (
    <>
      <AdminNav current="resumen" />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
        <h1 className="text-ink text-2xl font-semibold">Resumen</h1>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {ADMIN_ENTITIES.map((entity) => (
            <Link
              key={entity}
              href={`/admin/${entity}`}
              className="border-border bg-surface hover:bg-card-alt rounded-lg border p-4"
            >
              <span className="text-muted block text-sm">{ENTITY_DEFS[entity].plural}</span>
              <span className="text-ink block font-mono text-2xl font-semibold">
                {counts[entity].toLocaleString('es-PY')}
              </span>
            </Link>
          ))}
        </section>

        <section className="flex max-w-3xl flex-col gap-3">
          <h2 className="text-ink text-lg font-semibold">Últimos cambios</h2>
          <ActivityFeed entries={activity} />
        </section>
      </main>
    </>
  );
}
