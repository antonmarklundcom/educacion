'use server';

import { revalidatePath } from 'next/cache';

import type { AdminFormState } from '@/components/admin/AdminForm';
import { createUser, issueAccessLink, setUserStatus } from '@/db/queries/admin/users';
import { parseAdminUserInput } from '@/lib/admin/validation';
import { currentUser } from '@/lib/auth/session';

export async function createUserAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const user = await currentUser();
  const parsed = parseAdminUserInput(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  try {
    await createUser(user, parsed.data);
  } catch (error) {
    return {
      formError: error instanceof Error ? error.message : 'No se pudo crear la cuenta.',
    };
  }

  revalidatePath('/admin/usuarios');
  return {};
}

export interface AccessLinkState {
  /** The full URL, shown once. Never persisted, never re-derivable. */
  url?: string;
  email?: string;
  expiresLabel?: string;
  error?: string;
}

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://educacion.com.py').replace(/\/$/, '');
}

/**
 * Mint a link and hand it back to the browser **once** (PR-36).
 *
 * It is returned in the action's result rather than redirected to, because a
 * token in a URL ends up in the browser history, the server log and anything
 * that proxies the request. It lives in a response body and on the admin's
 * screen until they navigate away.
 */
export async function issueAccessLinkAction(
  userId: number,
  // `useActionState` always calls with (prevState, formData); this action reads
  // neither — the button carries no fields and the previous link is irrelevant.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: AccessLinkState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<AccessLinkState> {
  const user = await currentUser();

  try {
    const link = await issueAccessLink(user, userId);
    revalidatePath('/admin/usuarios');
    return {
      url: `${siteBase()}/recuperar-contrasena/${link.token}`,
      email: link.email,
      expiresLabel: link.expiresAt.toLocaleString('es-PY', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Asuncion',
      }),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo generar el enlace.',
    };
  }
}

export async function setUserStatusAction(
  userId: number,
  status: 'active' | 'suspended',
): Promise<void> {
  const user = await currentUser();
  await setUserStatus(user, userId, status);
  revalidatePath('/admin/usuarios');
}
