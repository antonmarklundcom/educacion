import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminTable, StatusBadge, type AdminColumn } from '@/components/admin/AdminTable';
import { Button } from '@/components/ui';
import { listPostsAdmin, type PostRow } from '@/db/queries/admin/posts';
import { formatDate } from '@/lib/format';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminBlogPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const params = await searchParams;
  const rawPage = params.page;
  const page = Number(Array.isArray(rawPage) ? rawPage[0] : rawPage) || 1;

  const { rows, total, pageSize } = await listPostsAdmin(user, { page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns: AdminColumn<PostRow>[] = [
    { header: 'Título', cell: (row) => row.title },
    { header: 'Slug', cell: (row) => row.slug },
    { header: 'Autor', cell: (row) => row.authorName },
    {
      header: 'Publicado',
      numeric: true,
      cell: (row) => (row.publishedAt ? formatDate(row.publishedAt) : '—'),
    },
    { header: 'Estado', cell: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-bold">Blog</h1>
          <p className="text-muted max-w-prose text-sm">
            Se escribe acá y se publica sin tocar el código. Un post no se puede publicar sin
            enlazar al menos una página de destino con un texto que la describa.
          </p>
        </div>
        <Button href="/admin/blog/nueva">Escribí un post</Button>
      </div>

      <AdminTable
        columns={columns}
        rows={rows}
        editHref={(row) => `/admin/blog/${row.id}`}
        emptyLabel="Todavía no hay ningún post."
        page={page}
        totalPages={totalPages}
        buildPageHref={(next) => `/admin/blog?page=${next}`}
      />
    </main>
  );
}
