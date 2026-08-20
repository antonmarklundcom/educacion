'use server';

import {
  countAllLeads,
  deleteLeadsByContact,
  findLeadsByContact,
  parseContactKey,
  type PersonalDataMatch,
} from '@/db/queries/admin/personal-data';
import { currentUser } from '@/lib/auth/session';

/**
 * The R-06 deletion tool's two actions (PR-44).
 *
 * ### Why the lookup is a POST and not a query string
 *
 * The operator types a phone number or an email address that belongs to
 * somebody who has just asked us to hold less of their data. A `GET` would put
 * it in the URL, and therefore in the browser history, the referrer of the next
 * request, and Hostinger's access log — three durable copies made while
 * servicing a request to delete one. So the lookup is an action, the matches
 * come back in its result, and nothing about the person ever reaches an address
 * bar. (Same reasoning as PR-36's access link, `usuarios/actions.ts`.)
 *
 * Neither action trusts anything the browser sends beyond the contact key
 * itself: no lead ids round-trip, and the delete re-runs its own lookup inside
 * the transaction. An id list in a form is an id list somebody can edit.
 *
 * Both call an `admin`-gated query; `requireRole` lives there, not here
 * (CLAUDE.md rule 4).
 */

export interface PersonalDataState {
  /** Echoed back so the screen can show what it searched for. */
  phone?: string;
  email?: string;
  matches?: PersonalDataMatch[];
  /** Set once a deletion has run — the screen switches to reporting it. */
  deleted?: number;
  totalLeads?: number;
  error?: string;
}

const NO_KEY = 'Escribí un teléfono paraguayo válido o una dirección de correo.';
const REFUSED = 'No se pudo completar. Revisá que tengas permiso de admin.';

export async function findPersonalDataAction(
  _prev: PersonalDataState,
  formData: FormData,
): Promise<PersonalDataState> {
  const phone = String(formData.get('phone') ?? '');
  const email = String(formData.get('email') ?? '');
  const key = parseContactKey({ phone, email });
  if (!key) return { phone, email, error: NO_KEY };

  const user = await currentUser();
  try {
    const [matches, totalLeads] = await Promise.all([
      findLeadsByContact(user, key),
      countAllLeads(user),
    ]);
    return { phone, email, matches, totalLeads };
  } catch (error) {
    return { phone, email, error: error instanceof Error ? error.message : REFUSED };
  }
}

export async function deletePersonalDataAction(
  _prev: PersonalDataState,
  formData: FormData,
): Promise<PersonalDataState> {
  const phone = String(formData.get('phone') ?? '');
  const email = String(formData.get('email') ?? '');

  // The confirmation is a field, checked here, because this is the one action
  // in the admin that destroys data on somebody else's say-so and cannot be
  // undone by any screen in this app.
  if (formData.get('confirm') !== 'on') {
    return { phone, email, error: 'Marcá la confirmación antes de borrar.' };
  }

  const key = parseContactKey({ phone, email });
  if (!key) return { phone, email, error: NO_KEY };

  const user = await currentUser();
  try {
    const result = await deleteLeadsByContact(user, key);
    // No `revalidatePath('/admin/actividad')`: that page is `force-dynamic`, so
    // there is no route cache to expire and the call would be decoration.
    return { phone, email, deleted: result.deleted };
  } catch (error) {
    return { phone, email, error: error instanceof Error ? error.message : REFUSED };
  }
}
