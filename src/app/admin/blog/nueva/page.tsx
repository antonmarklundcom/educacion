import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { createPostAction } from '../actions';
import { postFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NewPostPage() {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Escribí un post</h1>
      <AdminForm
        fields={postFields()}
        defaultValues={{ status: 'draft' }}
        action={createPostAction}
        submitLabel="Guardá el post"
        cancelHref="/admin/blog"
      />
    </main>
  );
}
