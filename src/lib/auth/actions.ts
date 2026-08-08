'use server';

/**
 * Session actions shared by every authenticated shell.
 *
 * Signing out lives here rather than beside the login page because `/admin`
 * and `/panel` both need it, and a layout reaching into another route's
 * `actions.ts` is the kind of import that quietly becomes a dependency cycle.
 */

import { redirect } from 'next/navigation';

import { endSession } from './session';

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect('/ingresar');
}
