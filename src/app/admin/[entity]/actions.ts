'use server';

/**
 * Every write the admin CRUD can perform (PR-19).
 *
 * ### The one rule this file exists to keep
 *
 * **Every mutation calls `requireRole` first, from the server, on every call.**
 * A server action is a POST endpoint with a generated URL: it is reachable
 * without ever rendering the layout that gates `/admin`, so the layout guard is
 * a backstop and this is the access control (CLAUDE.md rule 4). `requireRole`
 * throws, so there is no boolean to forget to check.
 *
 * ### And the one it keeps second
 *
 * **Every write logs before and after.** The `before` read happens *before* the
 * update, in the same action, so an edit is reconstructible from
 * `activity_log`. A create logs a null before; an archive logs the status flip
 * like any other update, because nothing is hard-deleted.
 *
 * `revalidatePath` and `scheduleSearchRebuild` run after the log, not before —
 * the operator's save is committed and recorded before anything derived from it
 * is touched.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  createEntity,
  readEntity,
  readInstitutionSlug,
  setEntityStatus,
  setInstitutionLogo,
  updateEntity,
} from '@/db/queries/admin';
import { logActivity } from '@/db/queries/activity-log';
import type { EntityFormState } from '@/components/admin/EntityForm';
import type { LogoUploadState } from '@/components/admin/LogoUploadForm';
import {
  ENTITY_DEFS,
  deriveSystemFields,
  isAdminEntity,
  parseEntityForm,
} from '@/lib/admin/entities';
import { scheduleSearchRebuild } from '@/lib/admin/reindex';
import { AuthError, requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';
import { objectKey, validateImageUpload } from '@/lib/uploads/contract';
import { uploadStorage } from '@/lib/uploads/storage';

/** Staff only. `editor` is the floor; `admin` satisfies it (roles.ts). */
async function requireStaff() {
  return requireRole(await currentUser(), ['editor']);
}

function readEntityKey(formData: FormData) {
  const raw = String(formData.get('__entity') ?? '');
  if (!isAdminEntity(raw)) throw new Error(`Unknown admin entity: ${raw}`);
  return raw;
}

function readId(formData: FormData): number | null {
  const raw = formData.get('__id');
  if (raw == null || raw === '') return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Create or update, decided by whether `__id` is present.
 *
 * One action for both is what lets one form component serve both, and it means
 * the authorization, the logging and the reindex cannot be present on one path
 * and missing on the other.
 */
export async function saveEntityAction(
  _state: EntityFormState,
  formData: FormData,
): Promise<EntityFormState> {
  let redirectTo: string;

  try {
    const user = await requireStaff();
    const entity = readEntityKey(formData);
    const def = ENTITY_DEFS[entity];
    const id = readId(formData);

    const parsed = parseEntityForm(def, formData);
    if (Object.keys(parsed.errors).length > 0) {
      return { errors: parsed.errors, message: 'Revisá los campos marcados.' };
    }
    const values = deriveSystemFields(def, parsed.values);

    if (id == null) {
      const newId = await createEntity(entity, values);
      await logActivity({
        userId: user.id,
        entityType: def.table,
        entityId: newId,
        action: 'create',
        before: null,
        after: values,
      });
      redirectTo = `/admin/${entity}/${newId}`;
    } else {
      const before = await readEntity(entity, id);
      if (!before) return { message: 'Ese registro ya no existe.' };
      await updateEntity(entity, id, values);
      const after = await readEntity(entity, id);
      await logActivity({
        userId: user.id,
        entityType: def.table,
        entityId: id,
        action: 'update',
        before,
        after,
      });
      redirectTo = `/admin/${entity}/${id}`;
    }

    scheduleSearchRebuild();
    revalidatePath('/carreras');
    revalidatePath('/universidades');
  } catch (error) {
    if (error instanceof AuthError) return { message: error.message };
    // A CHECK constraint or a duplicate slug lands here. The operator gets the
    // reason rather than a 500 page that loses the form they typed.
    console.error('[admin] save failed', error);
    return {
      message:
        error instanceof Error && /Duplicate entry/i.test(error.message)
          ? 'Ya existe un registro con ese slug o código. Cambiá uno de los dos.'
          : 'No se pudo guardar. Revisá los datos y probá de nuevo.',
    };
  }

  // Outside the try: `redirect` signals by throwing, and catching it here would
  // turn a successful save into "no se pudo guardar".
  redirect(redirectTo);
}

/** Soft delete and its inverse. Nothing is hard-deleted (data-model.md §3). */
export async function setStatusAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const entity = readEntityKey(formData);
  const def = ENTITY_DEFS[entity];
  const id = readId(formData);
  if (id == null) throw new Error('Missing id.');

  const raw = String(formData.get('status') ?? '');
  if (raw !== 'draft' && raw !== 'published' && raw !== 'archived') {
    throw new Error(`Unknown status: ${raw}`);
  }

  const before = await readEntity(entity, id);
  if (!before) return;
  await setEntityStatus(entity, id, raw);
  const after = await readEntity(entity, id);

  await logActivity({
    userId: user.id,
    entityType: def.table,
    entityId: id,
    action: raw === 'archived' ? 'archive' : raw === 'published' ? 'publish' : 'restore',
    before,
    after,
  });

  scheduleSearchRebuild();
  revalidatePath('/carreras');
  revalidatePath(`/admin/${entity}/${id}`);
}

/**
 * The institution logo upload — the `risks.md` §R-08 path, end to end.
 *
 * Validation is here rather than in the browser because `accept` on a file
 * input is a hint to the picker. The bytes are read once, hashed into a
 * content-addressed key, and handed to whichever adapter this deploy has; the
 * URL that comes back is what lands in `institutions.logo_url`.
 */
export async function uploadLogoAction(
  _state: LogoUploadState,
  formData: FormData,
): Promise<LogoUploadState> {
  try {
    const user = await requireStaff();

    const id = Number(formData.get('institutionId'));
    if (!Number.isInteger(id) || id <= 0) return { error: 'Institución inválida.' };

    const file = formData.get('logo');
    if (!(file instanceof File)) return { error: 'No seleccionaste ningún archivo.' };

    const check = validateImageUpload({ type: file.type, size: file.size, name: file.name });
    if (!check.ok) return { error: check.message };

    const slug = (await readInstitutionSlug(id)) ?? `institucion-${id}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const key = objectKey('logos', slug, bytes, check.extension);

    const stored = await uploadStorage().put(key, bytes, file.type);

    const before = await readEntity('instituciones', id);
    await setInstitutionLogo(id, stored.url);
    await logActivity({
      userId: user.id,
      entityType: 'institution',
      entityId: id,
      action: 'upload',
      before: { logoUrl: (before as { logoUrl?: string | null } | null)?.logoUrl ?? null },
      after: { logoUrl: stored.url },
    });

    scheduleSearchRebuild();
    revalidatePath(`/admin/instituciones/${id}`);
    revalidatePath('/universidades');

    return { message: 'Logo actualizado.' };
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message };
    console.error('[admin] logo upload failed', error);
    return {
      error:
        'No se pudo subir el archivo. Revisá la configuración de almacenamiento (deployment.md §4).',
    };
  }
}
