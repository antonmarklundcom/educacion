import { logoutAction } from '@/lib/auth/actions';

/**
 * Sign out.
 *
 * A plain `<form>` posting to a server action — no client component and no
 * JavaScript, which also means it cannot be a link. A GET that destroys a
 * session is a session any other page can end by embedding an image.
 */
export function SignOutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="text-muted hover:text-ink focus-visible:ring-ink cursor-pointer text-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
      >
        Cerrar sesión
      </button>
    </form>
  );
}
