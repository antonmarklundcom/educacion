import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui';
import { listAreasAdmin } from '@/db/queries/admin/areas';
import { MIN_EDITORIAL_WORDS, wordCount } from '@/lib/careers/copy';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The áreas, with the one number that decides whether their hub is indexable:
 * `seo.md` §4.1 keeps a hub `noindex` until its description clears 150 words,
 * and this page shows how far each one is rather than making an editor
 * discover it by publishing.
 */
export default async function AdminAreasPage() {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const areas = await listAreasAdmin(user);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Áreas</h1>
        <p className="text-muted max-w-prose text-sm">
          La descripción de cada área es lo que saca su página de{' '}
          <span className="font-mono">noindex</span>: hacen falta {MIN_EDITORIAL_WORDS} palabras
          propias. Las áreas no se crean ni se borran acá — son la taxonomía del buscador.
        </p>
      </div>

      <div className="border-border overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-border bg-card-alt border-b text-left">
              <th className="text-muted px-4 py-3 font-medium">Área</th>
              <th className="text-muted px-4 py-3 font-medium">Slug</th>
              <th className="text-muted px-4 py-3 text-right font-medium">Palabras</th>
              <th className="text-muted px-4 py-3 font-medium">Estado del hub</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => {
              const words = wordCount(area.descriptionMd);
              const indexable = words >= MIN_EDITORIAL_WORDS;
              return (
                <tr key={area.id} className="border-border border-b last:border-0">
                  <td className="text-body px-4 py-3">{area.nameEs}</td>
                  <td className="text-muted px-4 py-3 font-mono text-xs">{area.slug}</td>
                  <td className="text-body px-4 py-3 text-right font-mono">{words}</td>
                  <td className="px-4 py-3">
                    {indexable ? (
                      <Badge tone="ok">Indexable</Badge>
                    ) : (
                      <Badge tone="warn">noindex</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/areas/${area.id}`}
                      className="text-ink text-sm font-medium underline underline-offset-4"
                    >
                      Editá
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
