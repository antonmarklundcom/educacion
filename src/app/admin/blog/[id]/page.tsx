import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { getPostForEdit } from '@/db/queries/admin/posts';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { archivePostAction, updatePostAction } from '../actions';
import { postFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const post = await getPostForEdit(user, id);
  if (!post) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Editá el post</h1>
        <p className="text-muted text-sm">
          La fecha de publicación se sella una sola vez, la primera vez que se publica: editar un
          post no lo vuelve a poner arriba de todo.
        </p>
      </div>

      <AdminForm
        fields={postFields()}
        defaultValues={{
          ...post,
          publishedAt: post.publishedAt ? post.publishedAt.toISOString().slice(0, 10) : '',
        }}
        action={updatePostAction.bind(null, id)}
        submitLabel="Guardá los cambios"
        cancelHref="/admin/blog"
      />

      <form action={archivePostAction.bind(null, id)} className="border-border border-t pt-6">
        <button type="submit" className="text-danger text-sm underline underline-offset-4">
          Archivá este post (deja de verse en el sitio; no se borra)
        </button>
      </form>
    </main>
  );
}
